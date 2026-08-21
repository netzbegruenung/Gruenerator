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

interface CorpusInspection {
  state: string;
  indexing: unknown[];
  failed: unknown[];
  stale: unknown[];
  ready: unknown[];
  total: number;
}

/** `_inspectCorpusState` ist privat — der Zustand ist genau das Prüfziel. */
const inspect = (ids: string[]): Promise<CorpusInspection> =>
  (
    notebookQAService as unknown as {
      _inspectCorpusState(ids: readonly string[], userId: string): Promise<CorpusInspection>;
    }
  )._inspectCorpusState(ids, 'user-1');

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
