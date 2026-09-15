/**
 * Das Evidenz-Signal (#3140): der dichte Spitzenwert VOR dem Rerank.
 *
 * Zwei Ebenen. Unten die reine Rechnung — sie bevorzugt `dense_similarity`,
 * fällt auf `similarity` zurück und beantwortet die leere Liste mit `null`.
 * Der Rückfall ist keine Höflichkeit: auf einer server-seitig fusionierten
 * Sammlung ist `similarity` ein Fusionswert und kein Kosinus, auf einer nicht
 * migrierten gibt es `dense_similarity` gar nicht.
 *
 * Oben der Weg: `getSearchContext` gibt die Zahl heraus, ohne dass irgendein
 * Aufrufer sie nachrechnen muss. Die Attrappen-Vorlage stammt aus
 * `notebookDepthRetrieval.vitest.ts` — derselbe Schnitt, dieselben vier Mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const search = vi.fn();

vi.mock('../document-services/index.js', () => ({
  DocumentSearchService: class {
    search = (...args: unknown[]) => search(...args);
  },
}));
vi.mock('../QueryIntentService/QueryIntentService.js', () => ({
  queryIntentService: {
    detectDocumentScope: () => ({ collections: [], subcategoryFilters: {} }),
  },
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../bundestag/index.js', () => ({
  getEnrichedPersonSearchService: () => null,
}));

const { evidenceTopOf, notebookQAService } = await import('./NotebookQAService.js');

import { type ExpandedChunkResult } from '../search/types.js';

/** Ein expandierter Chunk, nur mit den Feldern, die die Rechnung liest. */
function chunk(similarity: number, denseSimilarity?: number | null): ExpandedChunkResult {
  return {
    document_id: 'doc',
    source_url: null,
    title: 'Dokument',
    snippet: 'Inhalt',
    filename: null,
    similarity,
    chunk_index: 0,
    page_number: null,
    ...(denseSimilarity !== undefined && { dense_similarity: denseSimilarity }),
  };
}

describe('evidenceTopOf', () => {
  it('nimmt den dichten Kosinus, wenn er da ist', () => {
    expect(evidenceTopOf([chunk(0.42, 0.97), chunk(0.99, 0.81)])).toBe(0.97);
  });

  it('fällt je Treffer einzeln auf similarity zurück', () => {
    // Gemischte Liste: ein migrierter Treffer, ein nicht migrierter. Das ist
    // die Mehr-Sammlungs-Lage, nicht ein Sonderfall.
    expect(evidenceTopOf([chunk(0.55), chunk(0.31, 0.88)])).toBe(0.88);
  });

  it('behandelt dense_similarity: null wie fehlend', () => {
    // Ein Dokument, dessen Chunks alle nur aus der BM25-Lane stammen, hat
    // keinen Kosinus — der Vorgänger-PR schreibt dort `null`, nicht 0.
    expect(evidenceTopOf([chunk(0.64, null)])).toBe(0.64);
  });

  it('liefert null für eine leere Liste', () => {
    expect(evidenceTopOf([])).toBeNull();
  });

  it('nimmt 0 als Wert an, nicht als "nichts"', () => {
    expect(evidenceTopOf([chunk(0, 0)])).toBe(0);
  });
});

/**
 * Ein Dokumenttreffer, wie ihn die attrappierte Suche liefert.
 *
 * Das Feld heisst `similarity_score`, NICHT `similarity`:
 * `expandResultsToChunks` (`SearchResultProcessor.ts:59`, `:77`) liest genau
 * das und setzt sonst 0 — ein Treffer mit `similarity` fiele lautlos unter die
 * Schwelle 0,35 und der Kontext käme als `null` zurück. `dense_similarity_score`
 * ist das Gegenstück auf der dichten Seite (Vorgänger-PR).
 */
function hit(i: number, denseScore?: number) {
  return {
    document_id: `doc-${i}`,
    title: `Dokument ${i}`,
    relevant_content: `Inhalt ${i}`,
    similarity_score: 0.9 - i / 100,
    chunk_index: i,
    source_url: null,
    ...(denseScore !== undefined && { dense_similarity_score: denseScore }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSearchContext — evidenceTop reist mit', () => {
  it('liefert den höchsten similarity-Wert, wenn kein dichter Wert da ist', async () => {
    search.mockResolvedValue({ results: [hit(0), hit(1), hit(2)] });
    const ctx = await notebookQAService.getSearchContext({
      question: 'Was steht zur sozialen Sicherung drin?',
      collectionId: 'grundsatz-system',
      depth: 'deep',
    });
    expect(ctx?.evidenceTop).toBeCloseTo(0.9, 10);
  });

  it('bevorzugt den dichten Kosinus, auch wenn er nicht auf dem Spitzentreffer sitzt', async () => {
    search.mockResolvedValue({ results: [hit(0, 0.5), hit(1, 0.97), hit(2, 0.6)] });
    const ctx = await notebookQAService.getSearchContext({
      question: 'Was steht zur sozialen Sicherung drin?',
      collectionId: 'grundsatz-system',
      depth: 'deep',
    });
    expect(ctx?.evidenceTop).toBeCloseTo(0.97, 10);
  });
});
