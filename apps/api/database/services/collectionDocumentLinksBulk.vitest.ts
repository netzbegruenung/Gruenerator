/**
 * Unit tests for NotebookQdrantHelper.getCollectionDocumentsForCollections —
 * the bulk notebook↔document join behind the public listing.
 *
 * The paging is the whole risk surface: Qdrant's scroll `offset` is inclusive,
 * so every page but the first repeats its first row. Getting that wrong drops
 * or duplicates links, which surfaces as a notebook that silently lost sources
 * — the exact failure this join exists to prevent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrollDocuments = vi.fn();
const errorLog = vi.fn();

vi.mock('./QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    client: {},
    collections: { notebook_collection_documents: 'notebook_collection_documents' },
  }),
}));
vi.mock('./QdrantService/operations/index.js', () => ({
  QdrantOperations: class {
    scrollDocuments = scrollDocuments;
  },
}));
vi.mock('./PostgresService.js', () => ({ getPostgresInstance: () => ({ query: vi.fn() }) }));
vi.mock('../../config/systemCollectionsConfig.js', () => ({
  getSystemCollectionConfig: () => null,
}));
vi.mock('../../services/document-services/DocumentProcessingService/index.js', () => ({
  triggerPendingDocProcessing: vi.fn(),
}));
vi.mock('../../services/mistral/index.js', () => ({ mistralEmbeddingService: {} }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ error: errorLog, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { NotebookQdrantHelper } = await import('./NotebookQdrantHelper.js');

const PAGE_SIZE = 1000;

const link = (id: number, collectionId: string) => ({
  id,
  payload: {
    collection_id: collectionId,
    document_id: `doc-${id}`,
    added_at: '2026-01-01T00:00:00.000Z',
    added_by: null,
  },
});

describe('getCollectionDocumentsForCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not touch Qdrant for an empty id list', async () => {
    const helper = new NotebookQdrantHelper();
    await expect(helper.getCollectionDocumentsForCollections([])).resolves.toEqual(new Map());
    expect(scrollDocuments).not.toHaveBeenCalled();
  });

  it('groups one short page by collection and asks Qdrant exactly once', async () => {
    scrollDocuments.mockResolvedValueOnce([link(1, 'a'), link(2, 'b'), link(3, 'a')]);

    const helper = new NotebookQdrantHelper();
    const result = await helper.getCollectionDocumentsForCollections(['a', 'b', 'c']);

    expect(scrollDocuments).toHaveBeenCalledTimes(1);
    // One `any` filter, not one call per id.
    expect(scrollDocuments.mock.calls[0]?.[1]).toEqual({
      must: [{ key: 'collection_id', match: { any: ['a', 'b', 'c'] } }],
    });
    expect(result.get('a')?.map((d) => d.document_id)).toEqual(['doc-1', 'doc-3']);
    expect(result.get('b')?.map((d) => d.document_id)).toEqual(['doc-2']);
    // 'c' has no links: absent, so the caller's `?? []` supplies "none".
    expect(result.has('c')).toBe(false);
  });

  it('pages with an inclusive offset — no link dropped, none counted twice', async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, i) => link(i + 1, 'a'));
    // Qdrant repeats the offset row, so page two starts with link 1000 again.
    const second = [link(PAGE_SIZE, 'a'), link(PAGE_SIZE + 1, 'a'), link(PAGE_SIZE + 2, 'a')];
    scrollDocuments.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const helper = new NotebookQdrantHelper();
    const result = await helper.getCollectionDocumentsForCollections(['a']);

    expect(scrollDocuments).toHaveBeenCalledTimes(2);
    expect(scrollDocuments.mock.calls[1]?.[2]).toMatchObject({
      limit: PAGE_SIZE + 1,
      offset: PAGE_SIZE,
    });
    const ids = result.get('a')?.map((d) => d.document_id) ?? [];
    expect(ids).toHaveLength(PAGE_SIZE + 2);
    expect(new Set(ids).size).toBe(PAGE_SIZE + 2);
    expect(ids.at(-1)).toBe(`doc-${PAGE_SIZE + 2}`);
  });

  it('logs loudly instead of truncating silently when the page cap is hit', async () => {
    // Every page comes back full, so the loop can only stop at the cap.
    scrollDocuments.mockImplementation(
      async (_c: string, _f: unknown, opts: { offset: number | null }) => {
        const start = (opts.offset ?? 0) as number;
        return Array.from({ length: PAGE_SIZE + (opts.offset === null ? 0 : 1) }, (_, i) =>
          link(start + i, 'a')
        );
      }
    );

    const helper = new NotebookQdrantHelper();
    await helper.getCollectionDocumentsForCollections(['a']);

    expect(scrollDocuments).toHaveBeenCalledTimes(20);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('abgebrochen'));
  });

  it('returns what it has rather than throwing when the scroll fails', async () => {
    scrollDocuments.mockRejectedValueOnce(new Error('qdrant down'));

    const helper = new NotebookQdrantHelper();
    await expect(helper.getCollectionDocumentsForCollections(['a'])).resolves.toEqual(new Map());
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('qdrant down'));
  });
});
