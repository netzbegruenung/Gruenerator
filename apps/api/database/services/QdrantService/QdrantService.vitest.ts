/**
 * #3167: `_performInit()` reconciles collections/indexes on every connect,
 * including for read-only scripts. `useQdrantConnectOnly()` lets a script
 * opt out before it reaches the singleton — connection + embedding init
 * still run, only `createCollections`/`createTextSearchIndexes` are skipped.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: { QDRANT_API_KEY: 'test-key', QDRANT_URL: 'http://localhost:6333' },
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    getCollections = vi.fn().mockResolvedValue({ collections: [] });
  },
}));

vi.mock('../../../services/mistral/index.js', () => ({
  mistralEmbeddingService: {
    init: vi.fn().mockResolvedValue(undefined),
    getDimensions: vi.fn().mockReturnValue(1024),
  },
}));

const createCollections = vi.fn().mockResolvedValue(undefined);
const createTextSearchIndexes = vi.fn().mockResolvedValue(undefined);
vi.mock('./collections.js', () => ({
  createCollections: (...args: unknown[]) => createCollections(...args),
  createTextSearchIndexes: (...args: unknown[]) => createTextSearchIndexes(...args),
  getCollectionStats: vi.fn(),
  getAllStats: vi.fn(),
  createSnapshot: vi.fn(),
}));

const { QdrantService, useQdrantConnectOnly } = await import('./QdrantService.js');

describe('QdrantService._performInit reconciliation', () => {
  it('runs collection and index reconciliation by default', async () => {
    const service = new QdrantService();
    await service.init();

    expect(createCollections).toHaveBeenCalledTimes(1);
    expect(createTextSearchIndexes).toHaveBeenCalledTimes(1);
    expect(service.isConnected).toBe(true);
  });

  it('skips reconciliation after useQdrantConnectOnly(), but stays connected', async () => {
    useQdrantConnectOnly();
    createCollections.mockClear();
    createTextSearchIndexes.mockClear();

    const service = new QdrantService();
    await service.init();

    expect(createCollections).not.toHaveBeenCalled();
    expect(createTextSearchIndexes).not.toHaveBeenCalled();
    expect(service.isConnected).toBe(true);
  });
});

describe('QdrantService startup', () => {
  it('reports available once an init() started before the constructor timer connects', async () => {
    const { mistralEmbeddingService } = await import('../../../services/mistral/index.js');
    vi.mocked(mistralEmbeddingService.init).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    const service = new QdrantService();
    const connecting = service.init();
    // Let the constructor's deferred init fire while the first one is still running.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(service.isAvailable()).resolves.toBe(true);
    await connecting;
  });
});
