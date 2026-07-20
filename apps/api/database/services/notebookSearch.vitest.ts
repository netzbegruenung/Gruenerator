/**
 * Unit tests for NotebookQdrantHelper.searchUserNotebookCollections — the
 * paging cursor and the payload guards, both of which are unreachable through
 * the SQL-backed global-search categories.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrollDocuments = vi.fn();

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

const { NotebookQdrantHelper } = await import('./NotebookQdrantHelper.js');

/** A Qdrant scroll point carrying the collection payload fields we read. */
const point = (id: number, name: string | null, description: string | null = null) => ({
  id,
  payload: {
    id: `uuid-${id}`,
    user_id: 'user-1',
    ...(name === null ? {} : { name }),
    description,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  vector: null,
});

describe('searchUserNotebookCollections', () => {
  beforeEach(() => {
    scrollDocuments.mockReset();
  });

  it('matches on name and description, case-insensitively', async () => {
    scrollDocuments.mockResolvedValueOnce([
      point(1, 'Klimaschutz'),
      point(2, 'Verkehr', 'Alles zum Klima'),
      point(3, 'Haushalt'),
    ]);

    const hits = await new NotebookQdrantHelper().searchUserNotebookCollections(
      'user-1',
      'klima',
      5
    );

    expect(hits.map((h) => h.name)).toEqual(['Klimaschutz', 'Verkehr']);
  });

  it('survives a notebook whose payload has no name', async () => {
    scrollDocuments.mockResolvedValueOnce([point(1, null), point(2, 'Klimaschutz')]);

    const hits = await new NotebookQdrantHelper().searchUserNotebookCollections(
      'user-1',
      'klima',
      5
    );

    expect(hits.map((h) => h.name)).toEqual(['Klimaschutz']);
  });

  it('pages past the first scroll window, skipping the inclusive cursor point', async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) => point(i + 1, `Notiz ${i + 1}`));
    scrollDocuments
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([point(200, 'Notiz 200'), point(201, 'Klimaschutz')]);

    const hits = await new NotebookQdrantHelper().searchUserNotebookCollections(
      'user-1',
      'klima',
      5
    );

    expect(hits.map((h) => h.name)).toEqual(['Klimaschutz']);
    expect(scrollDocuments).toHaveBeenCalledTimes(2);
    expect(scrollDocuments.mock.calls[0][2]).toMatchObject({ offset: null });
    expect(scrollDocuments.mock.calls[1][2]).toMatchObject({ offset: 200 });
  });

  it('stops as soon as the limit is reached', async () => {
    scrollDocuments.mockResolvedValueOnce([
      point(1, 'Klima A'),
      point(2, 'Klima B'),
      point(3, 'Klima C'),
    ]);

    const hits = await new NotebookQdrantHelper().searchUserNotebookCollections(
      'user-1',
      'klima',
      2
    );

    expect(hits).toHaveLength(2);
  });

  it('stops paging when a short page signals the end', async () => {
    scrollDocuments.mockResolvedValueOnce([point(1, 'Haushalt')]);

    const hits = await new NotebookQdrantHelper().searchUserNotebookCollections(
      'user-1',
      'klima',
      5
    );

    expect(hits).toEqual([]);
    expect(scrollDocuments).toHaveBeenCalledTimes(1);
  });
});
