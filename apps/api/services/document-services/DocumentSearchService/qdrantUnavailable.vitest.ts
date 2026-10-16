/**
 * GlitchTip #686/#687: `GET /api/documents/combined-content` answered 500.
 * `ensureInitialized()` latched after its first call even when Qdrant was not
 * reachable, so a worker that booted during a Qdrant hiccup threw
 * "Qdrant not available" for the rest of its life — and the first-chunk lookup,
 * which only feeds list previews, took the whole document list down with it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const qdrant = vi.hoisted(() => ({
  client: null as unknown,
  isConnected: false,
  init: vi.fn(async () => {}),
}));

vi.mock('../../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => qdrant,
}));

vi.mock('../trashedDocuments.js', () => ({
  trashedDocumentIds: vi.fn(async () => new Set()),
  withoutTrashedDocuments: vi.fn(async (ids: string[]) => ids),
}));

const scrollDocuments = vi.fn(async () => [
  { id: 'p1', payload: { document_id: 'doc-1', chunk_text: 'Erster Absatz' } },
]);
vi.mock('../../../database/services/QdrantOperations.js', () => ({
  QdrantOperations: class {
    scrollDocuments = scrollDocuments;
  },
}));

const { DocumentSearchService } = await import('./DocumentSearchService.js');

afterEach(() => {
  vi.useRealTimers();
  qdrant.client = null;
  qdrant.isConnected = false;
  qdrant.init.mockClear();
});

describe('DocumentSearchService without Qdrant', () => {
  it('returns no previews instead of throwing', async () => {
    const service = new DocumentSearchService();

    const result = await service.getDocumentFirstChunks('user-1', ['doc-1']);

    expect(result).toMatchObject({ success: false, chunks: {}, foundCount: 0 });
  });

  it('reconnects once Qdrant is back instead of staying disabled', async () => {
    vi.useFakeTimers();
    const service = new DocumentSearchService();
    await service.getDocumentFirstChunks('user-1', ['doc-1']);

    qdrant.client = {};
    qdrant.isConnected = true;
    vi.advanceTimersByTime(30_000);

    const result = await service.getDocumentFirstChunks('user-1', ['doc-1']);
    expect(result.chunks).toEqual({ 'doc-1': 'Erster Absatz' });
  });

  it('does not retry the connection on every request while Qdrant is down', async () => {
    vi.useFakeTimers();
    const service = new DocumentSearchService();

    await service.getDocumentFirstChunks('user-1', ['doc-1']);
    await service.getDocumentFirstChunks('user-1', ['doc-1']);

    expect(qdrant.init).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentSearchService first connect', () => {
  it('lets concurrent first requests wait for the same connect', async () => {
    let finish!: () => void;
    qdrant.init.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            qdrant.client = {};
            qdrant.isConnected = true;
            resolve();
          };
        })
    );
    const service = new DocumentSearchService();

    const first = service.getDocumentFirstChunks('user-1', ['doc-1']);
    const second = service.getDocumentFirstChunks('user-1', ['doc-1']);
    finish();

    expect((await second).chunks).toEqual({ 'doc-1': 'Erster Absatz' });
    await first;
  });
});
