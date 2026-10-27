/**
 * GlitchTip #686/#687: `GET /api/documents/combined-content` answered 500.
 * `ensureInitialized()` latched after its first call even when Qdrant was not
 * reachable, so a worker that booted during a Qdrant hiccup threw
 * "Qdrant not available" for the rest of its life — and the first-chunk lookup,
 * which only feeds list previews, took the whole document list down with it.
 * Reconnect throttling lives in QdrantService (see QdrantService.vitest.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const qdrant = vi.hoisted(() => ({
  operations: null as unknown,
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
const { DocumentSearchService } = await import('./DocumentSearchService.js');

afterEach(() => {
  qdrant.operations = null;
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
    const service = new DocumentSearchService();
    await service.getDocumentFirstChunks('user-1', ['doc-1']);

    qdrant.operations = { scrollDocuments };
    qdrant.isConnected = true;

    const result = await service.getDocumentFirstChunks('user-1', ['doc-1']);
    expect(result.chunks).toEqual({ 'doc-1': 'Erster Absatz' });
  });
});
