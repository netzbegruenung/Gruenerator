/**
 * Tests for the server-side hybrid path (Query API + RRF) and the BM25 upsert
 * enrichment, using a stubbed QdrantClient — no live server involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  batchUpsert,
  collectionSupportsBm25,
  enrichPointsWithBm25,
  withBm25Vector,
} from './batchOperations.js';
import { hybridSearch } from './hybridSearch.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

const SPARSE_CONFIG = { params: { sparse_vectors: { bm25: { modifier: 'idf' } } } };
const DENSE_ONLY_CONFIG = { params: {} };

interface FakeClientOptions {
  sparse?: boolean;
  queryPoints?: Array<{ id: number; score: number; payload: Record<string, unknown> }>;
}

function fakeClient(options: FakeClientOptions = {}) {
  const { sparse = true, queryPoints = [] } = options;
  return {
    getCollection: vi.fn().mockResolvedValue({
      config: sparse ? SPARSE_CONFIG : DENSE_ONLY_CONFIG,
    }),
    query: vi.fn().mockResolvedValue({ points: queryPoints }),
    scroll: vi.fn().mockResolvedValue({ points: [] }),
    search: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
  };
}

// collectionSupportsBm25 caches per collection name — unique names per test.
let collectionCounter = 0;
function uniqueCollection(): string {
  return `test_collection_${collectionCounter++}`;
}

// The legacy path's vectorSearch also uses client.query (plain dense query),
// so "no client.query call" no longer proves the server-side path was skipped.
// Server-side RRF calls are identified by their shape: prefetch + fusion query.
function serverSideRrfCalls(client: ReturnType<typeof fakeClient>) {
  return client.query.mock.calls.filter(([, args]) => {
    const options = args as { prefetch?: unknown; query?: unknown } | undefined;
    return options?.prefetch != null && !Array.isArray(options.query);
  });
}

describe('withBm25Vector', () => {
  it('attaches a named sparse vector derived from chunk_text', () => {
    const point = { id: 1, vector: [0.1, 0.2], payload: { chunk_text: 'Klimaschutz Programm' } };
    const enriched = withBm25Vector(point);
    expect(enriched.vector).toHaveProperty('');
    expect(enriched.vector).toHaveProperty('bm25');
    const bm25 = (enriched.vector as Record<string, { indices: number[] }>).bm25;
    expect(bm25.indices.length).toBeGreaterThan(0);
  });

  it('leaves points without chunk_text dense-only', () => {
    const point = { id: 1, vector: [0.1, 0.2], payload: { title: 'x' } };
    expect(withBm25Vector(point)).toBe(point);
  });

  it('leaves stopword-only chunk_text dense-only', () => {
    const point = { id: 1, vector: [0.1], payload: { chunk_text: 'und oder aber' } };
    expect(withBm25Vector(point)).toBe(point);
  });
});

describe('collectionSupportsBm25 / enrichPointsWithBm25', () => {
  it('detects the sparse vector declaration', async () => {
    const client = fakeClient({ sparse: true });
    expect(
      await collectionSupportsBm25(client as unknown as QdrantClient, uniqueCollection())
    ).toBe(true);
  });

  it('returns false for dense-only collections and keeps points unchanged', async () => {
    const client = fakeClient({ sparse: false });
    const collection = uniqueCollection();
    const points = [{ id: 1, vector: [0.1], payload: { chunk_text: 'Klimaschutz' } }];
    const result = await enrichPointsWithBm25(
      client as unknown as QdrantClient,
      collection,
      points
    );
    expect(result[0]).toBe(points[0]);
  });

  it('caches the capability lookup per collection', async () => {
    const client = fakeClient({ sparse: true });
    const collection = uniqueCollection();
    await collectionSupportsBm25(client as unknown as QdrantClient, collection);
    await collectionSupportsBm25(client as unknown as QdrantClient, collection);
    expect(client.getCollection).toHaveBeenCalledTimes(1);
  });
});

describe('batchUpsert BM25 enrichment', () => {
  it('upserts named vectors on sparse-enabled collections', async () => {
    const client = fakeClient({ sparse: true });
    const collection = uniqueCollection();
    await batchUpsert(client as unknown as QdrantClient, collection, [
      { id: 1, vector: [0.1], payload: { chunk_text: 'Klimaschutz Wahlprogramm' } },
    ]);
    const upserted = client.upsert.mock.calls[0][1].points[0];
    expect(upserted.vector).toHaveProperty('bm25');
  });

  it('upserts plain dense vectors on legacy collections', async () => {
    const client = fakeClient({ sparse: false });
    const collection = uniqueCollection();
    await batchUpsert(client as unknown as QdrantClient, collection, [
      { id: 1, vector: [0.1], payload: { chunk_text: 'Klimaschutz Wahlprogramm' } },
    ]);
    const upserted = client.upsert.mock.calls[0][1].points[0];
    expect(Array.isArray(upserted.vector)).toBe(true);
  });
});

describe('hybridSearch server-side path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the Query API with dense + sparse prefetch and RRF on migrated collections', async () => {
    const client = fakeClient({
      sparse: true,
      queryPoints: [
        { id: 2, score: 0.9, payload: { chunk_text: 'treffer' } },
        { id: 1, score: 0.4, payload: { chunk_text: 'anderes' } },
      ],
    });
    const response = await hybridSearch(
      client as unknown as QdrantClient,
      uniqueCollection(),
      [0.1, 0.2],
      'Klimaschutz Wahlprogramm',
      {},
      { limit: 2, threshold: 0.2 }
    );

    expect(response.metadata.fusionMethod).toBe('rrf-server');
    expect(response.results.map((r) => r.id)).toEqual([2, 1]);
    expect(client.query).toHaveBeenCalledTimes(1);
    const queryArgs = client.query.mock.calls[0][1];
    expect(queryArgs.prefetch).toHaveLength(2);
    expect(queryArgs.prefetch[0].using).toBe('');
    expect(queryArgs.prefetch[1].using).toBe('bm25');
    expect(queryArgs.query).toEqual({ fusion: 'rrf' });
    // legacy path untouched
    expect(client.scroll).not.toHaveBeenCalled();
    expect(client.search).not.toHaveBeenCalled();
  });

  it('falls back to the legacy path for stopword-only queries', async () => {
    const client = fakeClient({ sparse: true });
    const response = await hybridSearch(
      client as unknown as QdrantClient,
      uniqueCollection(),
      [0.1, 0.2],
      'und oder aber',
      {},
      { limit: 2 }
    );

    expect(response.metadata.fusionMethod).not.toBe('rrf-server');
    expect(serverSideRrfCalls(client)).toHaveLength(0);
  });

  it('falls back to the legacy path for unmigrated collections', async () => {
    const client = fakeClient({ sparse: false });
    const response = await hybridSearch(
      client as unknown as QdrantClient,
      uniqueCollection(),
      [0.1, 0.2],
      'Klimaschutz Wahlprogramm',
      {},
      { limit: 2 }
    );

    expect(response.metadata.fusionMethod).not.toBe('rrf-server');
    expect(serverSideRrfCalls(client)).toHaveLength(0);
  });
});
