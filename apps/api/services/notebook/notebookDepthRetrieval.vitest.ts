/**
 * Retrieval is tier-aware — the point of the depth tiers.
 *
 * Before this, `getSearchContext` took no depth at all: `limit`, `threshold`
 * and `recallLimit` were constants, so "Tiefenrecherche" retrieved exactly the
 * same candidates as "Schnell" and differed only in how many of them survived
 * reranking. These tests pin that each tier actually asks Qdrant for a
 * different amount, and that `fast` still asks for exactly what it always did.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const { notebookQAService } = await import('./NotebookQAService.js');
const { env } = await import('../../config/env.js');

/** One Qdrant hit, shaped enough to survive expansion and sorting. */
function hit(i: number) {
  return {
    document_id: `doc-${i}`,
    title: `Dokument ${i}`,
    content: `Inhalt ${i}`,
    similarity: 0.9 - i / 100,
    chunk_index: i,
    source_url: null,
  };
}

/** The search options the tier produced (first call). */
async function optionsFor(depth: 'fast' | 'deep' | 'ultra', queries?: string[]) {
  await notebookQAService.getSearchContext({
    question: 'Was steht zur sozialen Sicherung drin?',
    collectionId: 'grundsatz-system',
    depth,
    ...(queries && { queries }),
  });
  return search.mock.calls[0][0].options as {
    limit: number;
    threshold: number;
    recallLimit: number;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
});

describe('getSearchContext — retrieval per depth tier', () => {
  it('leaves fast on the pre-tier numbers', async () => {
    // Grün-O-Mat runs on this tier and is out of scope for the tier change.
    const opts = await optionsFor('fast');
    expect(opts.limit).toBe(30);
    expect(opts.threshold).toBe(0.35);
  });

  it('retrieves more per tier', async () => {
    const fast = await optionsFor('fast');
    vi.clearAllMocks();
    search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
    const deep = await optionsFor('deep');
    vi.clearAllMocks();
    search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
    const ultra = await optionsFor('ultra');

    expect(deep.limit).toBeGreaterThan(fast.limit);
    expect(ultra.limit).toBeGreaterThan(deep.limit);
    expect(deep.recallLimit).toBeGreaterThan(fast.recallLimit);
    expect(ultra.recallLimit).toBeGreaterThan(deep.recallLimit);
  });

  it('loosens the similarity cut only at the top tier', async () => {
    const deep = await optionsFor('deep');
    vi.clearAllMocks();
    search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
    const ultra = await optionsFor('ultra');

    expect(deep.threshold).toBe(0.35);
    expect(ultra.threshold).toBeLessThan(deep.threshold);
  });

  it('searches every formulation it is given, up to the tier limit', async () => {
    await optionsFor('ultra', ['eine', 'zwei', 'drei', 'vier']);
    // ultra takes three; the fourth is dropped rather than silently paid for.
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('ignores extra formulations on single-query tiers', async () => {
    await optionsFor('fast', ['eine', 'zwei', 'drei']);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

/** Five chunks of the SAME document — the shape the cap exists for. */
function dupHit(i: number) {
  return {
    document_id: 'doc-dup',
    title: 'Wiederholtes Dokument',
    chunk_text: `Chunk ${i}`,
    similarity_score: 0.9 - i / 100,
    chunk_index: i,
    source_url: null,
  };
}

describe('getSearchContext — NOTEBOOK_MAX_CHUNKS_PER_DOC reaches the selection', () => {
  const shippedDefault = env.NOTEBOOK_MAX_CHUNKS_PER_DOC;
  afterEach(() => {
    env.NOTEBOOK_MAX_CHUNKS_PER_DOC = shippedDefault;
  });

  it('ships with a cap of two (measured 2026-09-03)', () => {
    expect(shippedDefault).toBe(2);
  });

  it('leaves a five-chunk single-document result set unshrunk at 0 (no cap)', async () => {
    env.NOTEBOOK_MAX_CHUNKS_PER_DOC = 0;
    search.mockResolvedValue({ results: Array.from({ length: 5 }, (_, i) => dupHit(i)) });
    const context = await notebookQAService.getSearchContext({
      question: 'Was steht drin?',
      collectionId: 'grundsatz-system',
      depth: 'fast',
    });
    expect(context?.sortedResults).toHaveLength(5);
  });

  it('pulls a second document forward once the env value is set', async () => {
    env.NOTEBOOK_MAX_CHUNKS_PER_DOC = 2;
    const other = { ...dupHit(9), document_id: 'doc-other', similarity_score: 0.8 };
    search.mockResolvedValue({ results: [dupHit(0), dupHit(1), dupHit(2), other] });
    const context = await notebookQAService.getSearchContext({
      question: 'Was steht drin?',
      collectionId: 'grundsatz-system',
      depth: 'fast',
    });
    // Kopf gedeckelt, Rest hinten angehängt — nichts geht verloren.
    expect(context?.sortedResults.map((r) => r.document_id)).toEqual([
      'doc-dup',
      'doc-dup',
      'doc-other',
      'doc-dup',
    ]);
  });
});
