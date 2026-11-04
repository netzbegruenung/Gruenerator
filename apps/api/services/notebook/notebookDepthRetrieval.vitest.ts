/**
 * Retrieval is tier-aware — the point of the depth tiers.
 *
 * Before this, `getSearchContext` took no depth at all: `limit`, `threshold`
 * and `recallLimit` were constants, so "Tiefenrecherche" retrieved exactly the
 * same candidates as "Schnell" and differed only in how many of them survived
 * reranking. These tests pin that each tier actually asks Qdrant for a
 * different amount, and that `fast` still asks for exactly what it always did.
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

const { notebookQAService } = await import('./NotebookQAService.js');

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

  it('retrieves more per tier, up to the search ceiling', async () => {
    const fast = await optionsFor('fast');
    vi.clearAllMocks();
    search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
    const deep = await optionsFor('deep');
    vi.clearAllMocks();
    search.mockResolvedValue({ results: Array.from({ length: 10 }, (_, i) => hit(i)) });
    const ultra = await optionsFor('ultra');

    expect(deep.limit).toBeGreaterThan(fast.limit);
    // deep und ultra holen beide die 100, die Qdrant je Abfrage hergibt.
    expect(ultra.limit).toBe(deep.limit);
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

describe('getSearchContext — lexical terms (#5341)', () => {
  it('hands the terms to the search of the question', async () => {
    await notebookQAService.getSearchContext({
      question: 'Was steht zur Wärmepumpe drin?',
      collectionId: 'grundsatz-system',
      depth: 'deep',
      lexicalTerms: ['Wärmepumpe'],
    });
    expect(search.mock.calls[0][0].options.lexicalTerms).toEqual(['Wärmepumpe']);
  });

  it('keeps them away from the searches of sub-questions', async () => {
    await notebookQAService.getSearchContext({
      question: 'Was gilt zur Wärmepumpe? Und wie hoch ist die Förderung für Solardächer?',
      collectionId: 'grundsatz-system',
      depth: 'deep',
      lexicalTerms: ['Wärmepumpe'],
    });
    const withTerms = search.mock.calls.filter(([p]) => p.options.lexicalTerms);
    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(withTerms).toHaveLength(1);
  });

  it('sends none when the caller has none', async () => {
    await optionsFor('deep');
    expect(search.mock.calls[0][0].options).not.toHaveProperty('lexicalTerms');
  });
});

describe('getSearchContext — best passage per source (#5341)', () => {
  // A strong document brings more passages than the window holds, all at its
  // own score; a weak one has a single passage below them.
  const strongAndWeak = () => ({
    results: [
      {
        document_id: 'stark',
        title: 'Starker Beschluss',
        similarity_score: 0.9,
        top_chunks: Array.from({ length: 120 }, (_, i) => ({
          chunk_index: i,
          preview: `Stelle ${i}`,
        })),
      },
      {
        document_id: 'schwach',
        title: 'Schwacher Beschluss',
        similarity_score: 0.5,
        top_chunks: [{ chunk_index: 1, preview: 'Den Preis garantieren wir.' }],
      },
    ],
  });
  const sourcesAt = async (depth: 'fast' | 'deep' | 'ultra') => {
    search.mockResolvedValue(strongAndWeak());
    const ctx = await notebookQAService.getSearchContext({
      question: 'Welche Positionen gibt es zum Ticketpreis?',
      collectionId: 'grundsatz-system',
      depth,
    });
    return ctx!.sortedResults;
  };

  it('keeps the weak source in the deep window with its best passage', async () => {
    const rows = await sourcesAt('deep');
    expect(rows).toHaveLength(100);
    expect(rows.filter((r) => r.document_id === 'schwach')).toHaveLength(1);
  });

  it('leaves fast and ultra on the plain cut by score', async () => {
    for (const depth of ['fast', 'ultra'] as const) {
      const rows = await sourcesAt(depth);
      expect(rows.every((r) => r.document_id === 'stark')).toBe(true);
    }
  });
});

describe('getSearchContext — source tier', () => {
  const protocolAndDrucksache = () => ({
    results: [
      {
        document_id: 'debatte',
        title: 'Debatte',
        relevant_content: 'Redebeitrag',
        similarity_score: 0.8,
        top_chunks: [{ chunk_index: 0, content_type: 'plenarprotokoll', preview: 'Redebeitrag' }],
      },
      {
        document_id: 'antrag',
        title: 'Antrag',
        relevant_content: 'Antragstext',
        similarity_score: 0.798,
        top_chunks: [{ chunk_index: 0, content_type: 'drucksache', preview: 'Antragstext' }],
      },
    ],
  });
  const firstDocument = async (sourceTier?: 'equal' | 'documents-first') => {
    search.mockResolvedValue(protocolAndDrucksache());
    const context = await notebookQAService.getSearchContext({
      question: 'Welche Anträge gibt es zur IT-Sicherheit?',
      collectionId: 'landtag-nrw-system',
      depth: 'fast',
      ...(sourceTier && { sourceTier }),
    });
    return context!.sortedResults[0].document_id;
  };

  it('ranks a Drucksache ahead of a protocol it trails by less than the penalty', async () => {
    expect(await firstDocument('documents-first')).toBe('antrag');
  });

  it('keeps the score order without a tier or with equal', async () => {
    expect(await firstDocument()).toBe('debatte');
    expect(await firstDocument('equal')).toBe('debatte');
  });
});

describe('getSearchContext — failed searches (#5325)', () => {
  const failed = {
    success: false,
    message: 'Hybrid search failed: This operation was aborted',
    results: [],
  };

  it('throws when every search failed, instead of reporting "no passages"', async () => {
    search.mockResolvedValue(failed);
    await expect(
      notebookQAService.getSearchContext({
        question: 'Fasse die Drucksache 18/21208 zusammen.',
        collectionId: 'grundsatz-system',
        depth: 'deep',
      })
    ).rejects.toThrow(
      'Die Suche im Notebook ist fehlgeschlagen. Bitte versuche es gleich noch einmal.'
    );
  });

  it('answers from the searches that worked when only some failed', async () => {
    search.mockResolvedValueOnce(failed).mockResolvedValue({
      results: [
        {
          document_id: 'antwort',
          title: 'Antwort der Landesregierung',
          relevant_content: '1.200 Stellen unbesetzt',
          similarity_score: 0.8,
          top_chunks: [{ chunk_index: 0, preview: '1.200 Stellen unbesetzt' }],
        },
      ],
    });
    const ctx = await notebookQAService.getSearchContext({
      question: 'Lehrkräftemangel',
      collectionId: 'grundsatz-system',
      depth: 'ultra',
      queries: ['Lehrkräftemangel', 'fehlende Lehrkräfte', 'Lehrermangel Zahlen'],
    });
    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(ctx?.sortedResults.length).toBeGreaterThan(0);
  });
});
