/**
 * Ein leerer Suchindex darf nicht als "nichts gefunden" beim Nutzer ankommen.
 *
 * `documents.vector_count` hält fest, was die Indexierung einmal gemeldet hat;
 * verschwinden die Punkte später aus Qdrant, bleibt die Spalte stehen. Die
 * Korpus-Prüfung glaubte ihr — ein ausgeräumter Index sah deshalb aus wie ein
 * gesundes Notizbuch, in dem die Frage eben nicht vorkommt. Diese Tests halten
 * fest, dass Qdrant selbst gefragt wird, und dass ein Ausfall der Probe nicht
 * als fehlende Daten durchgereicht wird.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const countVectorsByDocument = vi.fn();
const pgQuery = vi.fn();

vi.mock('../document-services/index.js', () => ({
  DocumentSearchService: class {
    countVectorsByDocument = (...args: unknown[]) => countVectorsByDocument(...args);
    search = vi.fn();
  },
}));
vi.mock('../QueryIntentService/QueryIntentService.js', () => ({
  queryIntentService: {
    detectDocumentScope: () => ({ collections: [], subcategoryFilters: {} }),
  },
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...args: unknown[]) => pgQuery(...args) }),
}));
vi.mock('../bundestag/index.js', () => ({
  getEnrichedPersonSearchService: () => null,
}));

const { notebookQAService } = await import('./NotebookQAService.js');
const { inspectCorpusState, summarizeDocumentRows } = await import('./corpusState.js');

interface CorpusInspection {
  state: string;
  indexing: unknown[];
  failed: unknown[];
  stale: unknown[];
  ready: unknown[];
  total: number;
}

const inspect = (ids: string[]): Promise<CorpusInspection> => inspectCorpusState(ids, 'user-1');

const emptyMessage = (corpus: CorpusInspection | null): string =>
  (
    notebookQAService as unknown as {
      _buildEmptyResultMessage(name: string, corpus: CorpusInspection | null): string;
    }
  )._buildEmptyResultMessage('Notizbuch für Kassierer*innen', corpus);

/** Eine Postgres-Zeile, wie sie die Inspektion liest. */
function row(id: string, over: Partial<Record<string, unknown>> = {}) {
  return { id, title: `Dokument ${id}`, status: 'completed', vector_count: 12, ...over };
}

beforeEach(() => {
  countVectorsByDocument.mockReset();
  pgQuery.mockReset();
});

describe('Korpus-Prüfung fragt Qdrant statt vector_count', () => {
  it('meldet Dokumente ohne Punkte als stale, obwohl Postgres sie als fertig führt', async () => {
    pgQuery.mockResolvedValue([row('a'), row('b')]);
    countVectorsByDocument.mockResolvedValue(
      new Map([
        ['a', 0],
        ['b', 0],
      ])
    );

    const corpus = await inspect(['a', 'b']);

    expect(corpus.state).toBe('stale');
    expect(corpus.stale).toHaveLength(2);
    expect(corpus.ready).toHaveLength(0);
  });

  it('lässt Dokumente mit Punkten ready', async () => {
    pgQuery.mockResolvedValue([row('a')]);
    countVectorsByDocument.mockResolvedValue(new Map([['a', 12]]));

    const corpus = await inspect(['a']);

    expect(corpus.state).toBe('ready');
    expect(corpus.ready).toHaveLength(1);
    expect(corpus.stale).toHaveLength(0);
  });

  it('trennt vorhandene von fehlenden Punkten im selben Notizbuch', async () => {
    pgQuery.mockResolvedValue([row('a'), row('b')]);
    countVectorsByDocument.mockResolvedValue(
      new Map([
        ['a', 7],
        ['b', 0],
      ])
    );

    const corpus = await inspect(['a', 'b']);

    expect(corpus.state).toBe('stale');
    expect(corpus.stale).toHaveLength(1);
    expect(corpus.ready).toHaveLength(1);
  });

  it('behandelt einen Qdrant-Ausfall nicht als fehlende Daten', async () => {
    pgQuery.mockResolvedValue([row('a')]);
    countVectorsByDocument.mockRejectedValue(new Error('Qdrant not available'));

    const corpus = await inspect(['a']);

    expect(corpus.state).toBe('ready');
    expect(corpus.stale).toHaveLength(0);
    expect(corpus.ready).toHaveLength(1);
  });

  it('lässt einer nicht beantworteten Probe den Vorrang von Postgres', async () => {
    // Fehlender Schlüssel = Probe für dieses Dokument fehlgeschlagen, nicht "null Punkte".
    pgQuery.mockResolvedValue([row('a')]);
    countVectorsByDocument.mockResolvedValue(new Map());

    const corpus = await inspect(['a']);

    expect(corpus.stale).toHaveLength(0);
    expect(corpus.ready).toHaveLength(1);
  });

  it('meldet noch laufende Indexierung vor stale', async () => {
    pgQuery.mockResolvedValue([row('a', { status: 'processing' }), row('b')]);
    countVectorsByDocument.mockResolvedValue(new Map([['b', 0]]));

    const corpus = await inspect(['a', 'b']);

    expect(corpus.state).toBe('indexing');
    expect(corpus.stale).toHaveLength(1);
  });
});

describe('Abgeleiteter Notizbuch-Zustand für die Liste', () => {
  // Die Liste darf Qdrant nicht befragen (ein Aufruf pro Notizbuch wäre das
  // nächste N+1) — sie klassifiziert allein aus den Postgres-Zeilen.
  const state = (rows: Array<Record<string, unknown>>) =>
    summarizeDocumentRows(rows as Parameters<typeof summarizeDocumentRows>[0]).state;

  it('nennt ein Notizbuch ohne Dokumente leer', () => {
    expect(state([])).toBe('empty');
  });

  it('meldet indexing, solange ein Dokument noch wartet', () => {
    expect(state([row('a'), row('b', { status: 'uploaded' })])).toBe('indexing');
  });

  it('zählt processing und pending ebenfalls als indexing', () => {
    expect(state([row('a', { status: 'processing' })])).toBe('indexing');
    expect(state([row('a', { status: 'pending' })])).toBe('indexing');
  });

  it('meldet ready, wenn alle Dokumente Vektoren haben', () => {
    expect(state([row('a'), row('b')])).toBe('ready');
  });

  it('unterscheidet partial von failed', () => {
    expect(state([row('a'), row('b', { status: 'failed' })])).toBe('partial');
    expect(state([row('a', { status: 'failed' })])).toBe('failed');
  });

  it('wertet completed ohne Vektoren als fehlgeschlagen', () => {
    // Für die lesende Person ist das von einem Fehler nicht zu unterscheiden:
    // das Dokument gilt als fertig und ist trotzdem nicht durchsuchbar.
    expect(state([row('a', { vector_count: 0 })])).toBe('failed');
    expect(state([row('a'), row('b', { vector_count: 0 })])).toBe('partial');
  });

  it('liefert Zählwerte passend zum Zustand', () => {
    const { counts } = summarizeDocumentRows([
      row('a'),
      row('b', { status: 'failed' }),
      row('c', { status: 'processing' }),
    ] as Parameters<typeof summarizeDocumentRows>[0]);

    expect(counts).toEqual({ ready: 1, indexing: 1, failed: 1, total: 3 });
  });
});

describe('Meldung an den Nutzer', () => {
  it('nennt den fehlenden Suchindex statt "nichts gefunden"', () => {
    const text = emptyMessage({
      state: 'stale',
      indexing: [],
      failed: [],
      stale: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      ready: [],
      total: 2,
    });

    expect(text).toContain('Suchindex');
    expect(text).toContain('2 von 2');
    expect(text).not.toContain('keine passenden Stellen');
  });

  it('bleibt bei der gewohnten Meldung, wenn der Korpus gesund ist', () => {
    const text = emptyMessage({
      state: 'ready',
      indexing: [],
      failed: [],
      stale: [],
      ready: [{ id: 'a', title: 'A' }],
      total: 1,
    });

    expect(text).toContain('keine passenden Stellen');
  });
});
