import { beforeEach, describe, expect, it, vi } from 'vitest';

const hybridSearchCollection = vi.fn();

vi.mock('../qdrant/client.ts', () => ({
  hybridSearchCollection: (...args: unknown[]) => hybridSearchCollection(...args),
  searchCollection: vi.fn(),
  textSearchCollection: vi.fn(),
}));

vi.mock('../embeddings.ts', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

const { searchTool } = await import('./search.ts');

/** A hit as hybridSearchCollection hands it back: quality-boosted score, but
 *  still in the pre-boost fusion order. */
function hit(title: string, score: number, url: string) {
  return { score, title, url, text: `Auszug zu ${title}.`, searchMethod: 'hybrid', payload: {} };
}

type SearchResponse = {
  resultsCount: number;
  results: Array<{ rank: number; score: number; source: string; url: string; ref?: string }>;
};

async function search(overrides: Record<string, unknown> = {}) {
  return (await searchTool.handler({
    query: 'Verkehrswende',
    country: 'DE',
    collection: 'kommunalwiki',
    useCache: false,
    ...overrides,
  })) as unknown as SearchResponse;
}

beforeEach(() => {
  hybridSearchCollection.mockReset();
});

describe('gruenerator_search — Ein-Sammlungs-Pfad', () => {
  it('nummeriert nach Score, auch wenn die Fusion anders geordnet hat', async () => {
    // Exactly the production shape that exposed this: the second hit scores
    // higher than the first because the quality boost is applied after ranking.
    hybridSearchCollection.mockResolvedValue({
      results: [
        hit('Bitte wenden!', 0.976, 'https://kommunalwiki.boell.de/index.php/Bitte_wenden!'),
        hit('Dossier', 0.985, 'https://kommunalwiki.boell.de/index.php/Dossier'),
        hit('Koalitionsvertrag', 0.939, 'https://kommunalwiki.boell.de/index.php/Koalition'),
      ],
      metadata: { searchType: 'hybrid' },
    });

    const response = await search();

    expect(response.results.map((r) => r.source)).toEqual([
      'Dossier',
      'Bitte wenden!',
      'Koalitionsvertrag',
    ]);
    expect(response.results.map((r) => r.rank)).toEqual([1, 2, 3]);
    const scores = response.results.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('lässt mehrere Passagen desselben Dokuments stehen', async () => {
    // Two chunks of one document are two pieces of evidence, not a duplicate —
    // the multi-collection path drops them because there the same URL really is
    // the same document found twice.
    const url = 'https://kommunalwiki.boell.de/index.php/Bitte_wenden!';
    hybridSearchCollection.mockResolvedValue({
      results: [hit('Bitte wenden!', 0.97, url), hit('Bitte wenden!', 0.95, url)],
      metadata: { searchType: 'hybrid' },
    });

    const response = await search();

    expect(response.resultsCount).toBe(2);
    expect(response.results.every((r) => r.url === url)).toBe(true);
  });
});
