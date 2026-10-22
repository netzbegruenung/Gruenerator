/**
 * Moderation of a notebook is a `moderation` payload field on its Qdrant
 * point. Two traps: every update rewrites the whole payload (a rename must not
 * undo a removal), and a report has to reach a notebook its owner trashed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { scrollDocuments, batchUpsert, setPayload } = vi.hoisted(() => ({
  scrollDocuments: vi.fn(),
  batchUpsert: vi.fn(),
  setPayload: vi.fn(),
}));

vi.mock('./QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    client: {},
    collections: { notebook_collections: 'notebook_collections' },
  }),
}));
vi.mock('./QdrantService/operations/index.js', () => ({
  QdrantOperations: class {
    scrollDocuments = scrollDocuments;
    batchUpsert = batchUpsert;
    client = { setPayload };
  },
}));
vi.mock('./PostgresService.js', () => ({ getPostgresInstance: () => ({ query: vi.fn() }) }));
vi.mock('../../config/systemCollectionsConfig.js', () => ({
  getSystemCollectionConfig: () => null,
}));
vi.mock('../../services/document-services/DocumentProcessingService/index.js', () => ({
  triggerPendingDocProcessing: vi.fn(),
}));
vi.mock('../../services/mistral/index.js', () => ({
  mistralEmbeddingService: { init: vi.fn(), generateEmbedding: vi.fn(async () => [0.1]) },
}));

const { NotebookQdrantHelper } = await import('./NotebookQdrantHelper.js');

const point = (payload: Record<string, unknown>) => ({
  id: 1,
  payload: {
    collection_id: 'nb-1',
    user_id: 'user-1',
    name: 'Klima',
    slug_suffix: 'Ab3xK9',
    ...payload,
  },
});

const byId = { must: [{ key: 'collection_id', match: { value: 'nb-1' } }] };

beforeEach(() => {
  scrollDocuments.mockReset();
  batchUpsert.mockReset();
  setPayload.mockReset();
});

describe('notebook moderation', () => {
  it('reads a point without the field as `ok`', async () => {
    scrollDocuments.mockResolvedValueOnce([point({})]);
    expect((await new NotebookQdrantHelper().getNotebookCollection('nb-1'))?.moderation).toBe('ok');
  });

  it('keeps a removal when the notebook is renamed', async () => {
    scrollDocuments.mockResolvedValueOnce([point({ moderation: 'removed' })]);

    await new NotebookQdrantHelper().updateNotebookCollection('nb-1', { name: 'Neuer Name' });

    const [, [stored]] = batchUpsert.mock.calls[0] as [
      string,
      [{ payload: Record<string, unknown> }],
    ];
    expect(stored.payload).toMatchObject({ name: 'Neuer Name', moderation: 'removed' });
  });

  it('sets the state on a trashed notebook too', async () => {
    scrollDocuments.mockResolvedValueOnce([
      point({ moderation: 'ok', deleted_at: '2026-10-01T00:00:00.000Z' }),
    ]);

    expect(await new NotebookQdrantHelper().setNotebookModeration('nb-1', 'removed')).toBe(
      'removed'
    );
    expect(scrollDocuments).toHaveBeenCalledWith('notebook_collections', byId, expect.anything());
    expect(setPayload).toHaveBeenCalledWith('notebook_collections', {
      payload: { moderation: 'removed' },
      filter: byId,
    });
  });

  it('leaves the state alone when it is not the one `onlyFrom` names', async () => {
    scrollDocuments.mockResolvedValueOnce([point({ moderation: 'removed' })]);

    expect(await new NotebookQdrantHelper().setNotebookModeration('nb-1', 'hidden', 'ok')).toBe(
      'removed'
    );
    expect(setPayload).not.toHaveBeenCalled();
  });

  it('answers null for a notebook that is gone', async () => {
    scrollDocuments.mockResolvedValueOnce([]);
    expect(await new NotebookQdrantHelper().setNotebookModeration('nb-1', 'ok')).toBeNull();
  });
});
