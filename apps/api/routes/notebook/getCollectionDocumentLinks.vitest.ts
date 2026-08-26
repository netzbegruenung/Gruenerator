/**
 * Regression test for `getCollection`'s source readiness.
 *
 * A freshly created notebook with fully indexed sources greeted its owner with
 * "Dieses Notizbuch hat noch keine Quellen". Root cause: only the LIST getters
 * attach `notebook_collection_documents` to a collection; `getNotebookCollection`
 * hands back the bare Qdrant payload, where the field is absent. The enricher
 * read that absence as "no documents", so every single-notebook response
 * carried `document_count: 0` and `indexing_state: 'empty'`.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHelper = vi.hoisted(() => ({
  getNotebookCollection: vi.fn(),
  getCollectionDocuments: vi.fn(),
  getNotebookCollectionBySlugSuffix: vi.fn(),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return mockHelper;
  },
}));

const mockPg = vi.hoisted(() => ({ query: vi.fn(async () => []) }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));

const mockAccess = vi.hoisted(() => ({ checkNotebookAccess: vi.fn() }));
vi.mock('./notebookAccess.js', () => ({
  checkNotebookAccess: mockAccess.checkNotebookAccess,
  requireNotebookEdit: vi.fn(),
  requireNotebookOwner: vi.fn(),
  requireNotebookRead: vi.fn(),
}));

vi.mock('../../services/usage/ItemUsageService.js', () => ({
  getUsageMap: vi.fn(async () => new Map()),
}));
vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: vi.fn(),
}));
vi.mock('../../services/entityLikes/EntityLikesService.js', () => ({
  getLikeCountsForEntities: vi.fn(async () => new Map()),
  getLikedEntityIdsForUser: vi.fn(),
  likeEntity: vi.fn(),
  unlikeEntity: vi.fn(),
}));
vi.mock('../../services/notifications/NotificationService.js', () => ({
  createNotification: vi.fn(),
}));
vi.mock('../../services/user/ProfileService.js', () => ({ getProfileService: vi.fn() }));

import { notebookCollectionsContractRouter } from './notebookCollectionsContractRouter.js';

const NOTEBOOK_ID = '11111111-2222-3333-4444-555555555555';

const callGetCollection = () =>
  (
    notebookCollectionsContractRouter.getCollection as (args: unknown) => Promise<{
      status: number;
      body: {
        collection?: {
          document_count: number;
          indexing_state: string;
          documents: Array<{ id: string }>;
        };
      };
    }>
  )({
    req: { user: { id: 'user-1' }, originalUrl: `/api/auth/notebook-collections/${NOTEBOOK_ID}` },
    params: { slugOrId: NOTEBOOK_ID },
  });

describe('getCollection — document links are resolved, not assumed absent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.checkNotebookAccess.mockResolvedValue({
      exists: true,
      canRead: true,
      isOwner: true,
    });
    // The bare Qdrant payload: no `notebook_collection_documents` field at all.
    mockHelper.getNotebookCollection.mockResolvedValue({
      id: NOTEBOOK_ID,
      user_id: 'user-1',
      name: 'Presseschau',
      share_mode: 'private',
    });
  });

  it('looks the links up and reports a fully indexed notebook as ready', async () => {
    mockHelper.getCollectionDocuments.mockResolvedValue([{ document_id: 'doc-1' }]);
    mockPg.query.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Artikel',
        page_count: 1,
        created_at: '2026-08-26T00:00:00.000Z',
        source_type: 'upload',
        wolke_share_link_id: null,
        status: 'completed',
        vector_count: 12,
        metadata: {},
      },
    ] as never);

    const res = await callGetCollection();

    expect(res.status).toBe(200);
    expect(mockHelper.getCollectionDocuments).toHaveBeenCalledWith(NOTEBOOK_ID);
    expect(res.body.collection?.document_count).toBe(1);
    expect(res.body.collection?.indexing_state).toBe('ready');
  });

  it('still reports `empty` when the lookup genuinely finds no links', async () => {
    mockHelper.getCollectionDocuments.mockResolvedValue([]);

    const res = await callGetCollection();

    expect(res.status).toBe(200);
    expect(res.body.collection?.document_count).toBe(0);
    expect(res.body.collection?.indexing_state).toBe('empty');
  });
});
