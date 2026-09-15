/**
 * The options the direct-search executors hand downstream.
 *
 * Two regressions live here. `searchMode` used to be hard-coded to `'hybrid'`
 * at every one of its six occurrences — the request option, the no-result retry
 * and the four reported result envelopes — so the MCP server could not offer the
 * keyword-only mode v1 always had, and the envelope claimed "hybrid" no matter
 * what ran. And `executeDirectExamplesSearch` neither forwarded `limit` (the
 * service capped at its own default of 10 while the caller sliced afterwards)
 * nor carried `url`/`relevance` out of `UnifiedExample`, which left the MCP
 * tool's source ref with nothing but a bare id.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const search = vi.fn();
const searchExamples = vi.fn();

vi.mock('../../../services/document-services/index.js', () => ({
  DocumentSearchService: class {
    search = (...a: unknown[]) => search(...a);
  },
}));

vi.mock('../../../services/examples/exampleSearchService.js', () => ({
  searchExamples: (...a: unknown[]) => searchExamples(...a),
}));

const { executeDirectSearch, executeDirectExamplesSearch } =
  await import('./directSearchExecutors.js');

const okResponse = {
  success: true,
  results: [
    {
      document_id: 'doc-1',
      title: 'Ein Beschluss',
      chunk_text: 'Inhalt',
      score: 0.9,
      source_url: 'https://example.org/a',
    },
  ],
};

beforeEach(() => {
  search.mockReset();
  searchExamples.mockReset();
});

describe('executeDirectSearch — searchMode', () => {
  it('defaults to hybrid when the caller says nothing', async () => {
    search.mockResolvedValue(okResponse);
    const result = await executeDirectSearch({ query: 'Klimaschutz' });
    expect(search.mock.calls[0]?.[0].options.mode).toBe('hybrid');
    expect(result.searchMode).toBe('hybrid');
  });

  it('forwards text mode to the search service', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz', searchMode: 'text' });
    expect(search.mock.calls[0]?.[0].options.mode).toBe('text');
  });

  it('reports the mode that actually ran, not a fixed string', async () => {
    search.mockResolvedValue(okResponse);
    const result = await executeDirectSearch({ query: 'Klimaschutz', searchMode: 'vector' });
    expect(result.searchMode).toBe('vector');
  });

  it('keeps the mode on the empty-result envelope', async () => {
    search.mockResolvedValue({ success: true, results: [] });
    const result = await executeDirectSearch({ query: 'Klimaschutz', searchMode: 'text' });
    expect(result.resultsCount).toBe(0);
    expect(result.searchMode).toBe('text');
  });

  it('keeps the mode on the failure envelope', async () => {
    search.mockResolvedValue({ success: false, error: 'kaputt' });
    const result = await executeDirectSearch({ query: 'Klimaschutz', searchMode: 'vector' });
    expect(result.error).toBe(true);
    expect(result.searchMode).toBe('vector');
  });

  it('only forwards useCache when the caller sets it', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz' });
    expect(search.mock.calls[0]?.[0].options).not.toHaveProperty('useCache');

    search.mockClear();
    await executeDirectSearch({ query: 'Klimaschutz', useCache: false });
    expect(search.mock.calls[0]?.[0].options.useCache).toBe(false);
  });
});

describe('executeDirectExamplesSearch', () => {
  const socialResult = (items: unknown[]) => ({ errors: {}, byKind: { social: items } });

  it('forwards limit to the search instead of slicing afterwards', async () => {
    searchExamples.mockResolvedValue(socialResult([]));
    await executeDirectExamplesSearch({ query: 'Verkehr', limit: 12 });
    expect(searchExamples.mock.calls[0]?.[0].limit).toBe(12);
  });

  it('omits limit when the caller does not set one', async () => {
    searchExamples.mockResolvedValue(socialResult([]));
    await executeDirectExamplesSearch({ query: 'Verkehr' });
    expect(searchExamples.mock.calls[0]?.[0]).not.toHaveProperty('limit');
  });

  it('carries url and relevance through so a result can be cited', async () => {
    searchExamples.mockResolvedValue(
      socialResult([
        {
          id: 'x1',
          body: 'Text',
          platform: 'instagram',
          url: 'https://example.org/p/1',
          relevance: 0.77,
        },
      ])
    );
    const result = await executeDirectExamplesSearch({ query: 'Verkehr' });
    expect(result.examples[0]).toMatchObject({
      url: 'https://example.org/p/1',
      relevance: 0.77,
    });
  });

  it('omits url for posts that have no permalink', async () => {
    searchExamples.mockResolvedValue(
      socialResult([{ id: 'x2', body: 'Text', platform: 'facebook', relevance: 0.5 }])
    );
    const result = await executeDirectExamplesSearch({ query: 'Verkehr' });
    expect(result.examples[0]).not.toHaveProperty('url');
    expect(result.examples[0]).toHaveProperty('relevance', 0.5);
  });
});

describe('executeDirectSearch — Chunk-Rerank', () => {
  it('bestellt den Cross-Encoder nicht, wenn niemand ihn verlangt', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz' });
    expect(search.mock.calls[0]?.[0].options).not.toHaveProperty('rerankChunks');
  });

  it('reicht rerankChunks an den Suchdienst durch', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz', rerankChunks: true });
    expect(search.mock.calls[0]?.[0].options.rerankChunks).toBe(true);
  });

  /**
   * min(min(12, 5) · 2, 80) = 10 → round(10 · 3,0) = 30 Chunks = exakt
   * CHUNK_RERANK_POOL_MAX. Ohne die Klemme lägen bei limit 12 rund 72 Chunks
   * an, von denen 42 ihren Kosinus behielten und im selben `sort` gegen
   * Encoder-Werte anträten.
   */
  it('klemmt das an Qdrant gereichte Limit auf dem rerankten Pfad', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz', limit: 12, rerankChunks: true });
    expect(search.mock.calls[0]?.[0].options.limit).toBe(10);
  });

  it('lässt das Limit ohne Rerank unangetastet', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz', limit: 12 });
    expect(search.mock.calls[0]?.[0].options.limit).toBe(24);
  });

  it('klemmt ein kleines Limit nicht nach oben', async () => {
    search.mockResolvedValue(okResponse);
    await executeDirectSearch({ query: 'Klimaschutz', limit: 3, rerankChunks: true });
    expect(search.mock.calls[0]?.[0].options.limit).toBe(6);
  });
});

describe('executeDirectSearch — Degradations-Marker', () => {
  it('trägt einen ausgefallenen Cross-Encoder ans Ergebnis', async () => {
    search.mockResolvedValue({ ...okResponse, metadata: { rerankDegraded: true } });
    const result = await executeDirectSearch({ query: 'Klimaschutz', rerankChunks: true });
    expect(result.rerankDegraded).toBe(true);
  });

  it('setzt das Feld gar nicht, wenn der Encoder geliefert hat', async () => {
    search.mockResolvedValue({ ...okResponse, metadata: { cached: false } });
    const result = await executeDirectSearch({ query: 'Klimaschutz', rerankChunks: true });
    expect(result).not.toHaveProperty('rerankDegraded');
  });

  it('setzt das Feld gar nicht, wenn niemand rerankt hat', async () => {
    search.mockResolvedValue(okResponse);
    const result = await executeDirectSearch({ query: 'Klimaschutz' });
    expect(result).not.toHaveProperty('rerankDegraded');
  });
});
