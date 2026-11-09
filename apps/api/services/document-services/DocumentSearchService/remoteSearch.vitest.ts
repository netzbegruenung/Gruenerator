/**
 * Eine Remote-Sammlung (`remoteSource`) läuft durch dieselbe Suche wie eine
 * Qdrant-Sammlung — Gruppierung, Ranking, Schwelle —, braucht aber kein Qdrant.
 * Und ein Ausfall der Quelle ist `SOURCE_UNAVAILABLE`, nie „keine Treffer".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const qdrant = vi.hoisted(() => ({
  operations: null as unknown,
  isConnected: false,
  init: vi.fn(async () => {}),
}));
vi.mock('../../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => qdrant,
}));

const source = vi.hoisted(() => ({
  id: 'bundestag-wrapped' as const,
  label: 'Bundestag-Quelle',
  search: vi.fn(),
  facetCounts: vi.fn(),
  chunks: vi.fn(),
}));
vi.mock('../../notebook/remoteSources/registry.js', () => ({ getRemoteSource: () => source }));

const { DocumentSearchService } = await import('./DocumentSearchService.js');
const { RemoteSourceUnavailableError } = await import('../../notebook/remoteSources/errors.js');

const VECTOR = Array.from({ length: 1024 }, () => 0.01);

const hit = (doc: string, chunk: number, score: number) => ({
  id: `${doc}-${chunk}`,
  score,
  payload: {
    document_id: `rede:${doc}`,
    content_type: 'rede',
    title: `Rede ${doc}`,
    source_url: `https://dserver.bundestag.de/btp/21/21105.pdf#rede-${doc}`,
    published_at: '2026-11-06',
    chunk_index: chunk,
    chunk_text: `Text ${doc}/${chunk} über Wärmepumpen`,
  },
});

const search = (service: InstanceType<typeof DocumentSearchService>, mode = 'hybrid') =>
  service.search({
    query: 'Wärmepumpen',
    userId: undefined,
    options: {
      limit: 10,
      mode,
      threshold: 0.35,
      remoteSource: 'bundestag-wrapped',
      additionalFilter: { must: [{ key: 'party', match: { value: 'GRÜNE' } }] },
      queryVector: VECTOR,
      useCache: false,
    },
  } as never);

beforeEach(() => {
  source.search.mockReset();
});

describe('DocumentSearchService with a remote source', () => {
  it('searches without Qdrant and groups the hits per document', async () => {
    source.search.mockResolvedValue([hit('a', 0, 0.82), hit('a', 1, 0.7), hit('b', 0, 0.6)]);

    const resp = await search(new DocumentSearchService());

    expect(resp.success).toBe(true);
    expect(resp.results.map((r) => r.document_id)).toEqual(['rede:a', 'rede:b']);
    // The remote cosine is the dense score the 0.35 cut is written for.
    expect(resp.results[0]!.dense_similarity_score).toBeCloseTo(0.82);
    expect(source.search).toHaveBeenCalledWith(
      expect.objectContaining({
        vector: VECTOR,
        query: 'Wärmepumpen',
        filters: { match: { party: ['GRÜNE'] } },
      })
    );
  });

  it('runs vector mode through the same source', async () => {
    source.search.mockResolvedValue([hit('a', 0, 0.82)]);
    const resp = await search(new DocumentSearchService(), 'vector');
    expect(resp.results).toHaveLength(1);
  });

  it('reports an outage as SOURCE_UNAVAILABLE, not as an empty result', async () => {
    source.search.mockRejectedValue(
      new RemoteSourceUnavailableError('bundestag-wrapped', 'Bundestag-Quelle', 'HTTP 503')
    );

    const resp = await search(new DocumentSearchService());

    expect(resp).toMatchObject({
      success: false,
      code: 'SOURCE_UNAVAILABLE',
      error: 'Bundestag-Quelle gerade nicht erreichbar',
    });
  });

  it('refuses text mode instead of answering from somewhere else', async () => {
    const resp = await search(new DocumentSearchService(), 'text');
    expect(resp).toMatchObject({ success: false });
    expect(source.search).not.toHaveBeenCalled();
  });
});
