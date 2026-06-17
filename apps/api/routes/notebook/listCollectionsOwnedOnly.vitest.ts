/**
 * Privacy regression test for `listCollections`.
 *
 * A user reported that notebooks created by OTHER users appeared in their own
 * "Eigene" list. Root cause: listCollections used to merge three buckets —
 * owned + group-shared + every share_mode='authenticated' notebook in the
 * system — into one response, so another user's authenticated-shared notebook
 * surfaced in everyone's personal list.
 *
 * The personal list must be strictly the caller's OWN notebooks. This test
 * locks that: listCollections fetches only getUserNotebookCollections(userId)
 * and NEVER reaches for the cross-user helpers
 * (getNotebookCollectionsByShareMode / getNotebookCollectionsByIds). Shared
 * notebooks stay reachable by direct link / the public "Von der Basis" listing.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Data layer: stub the Qdrant helper so the handler can run without Qdrant.
const mockHelper = vi.hoisted(() => ({
  getUserNotebookCollections: vi.fn(),
  getNotebookCollectionsByShareMode: vi.fn(),
  getNotebookCollectionsByIds: vi.fn(),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  // Constructable stub: returning an object from a constructor makes `new`
  // yield that object, so `new NotebookQdrantHelper()` resolves to mockHelper.
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return mockHelper;
  },
}));

// Postgres: enrichNotebookCollection queries documents; return none.
const mockPg = vi.hoisted(() => ({ query: vi.fn(async () => []) }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));

vi.mock('../../services/usage/ItemUsageService.js', () => ({
  getUsageMap: vi.fn(async () => new Map()),
}));

// Heavy service modules imported by the router but unused by listCollections —
// stub so importing the router doesn't spin up real clients.
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
vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: vi.fn(),
}));
vi.mock('./notebookAccess.js', () => ({
  checkNotebookAccess: vi.fn(),
  requireNotebookEdit: vi.fn(),
  requireNotebookOwner: vi.fn(),
  requireNotebookRead: vi.fn(),
}));

import { notebookCollectionsContractRouter } from './notebookCollectionsContractRouter.js';

const callListCollections = (userId: string) =>
  // The ts-rest router object exposes each handler as a callable; we invoke it
  // directly with a minimal request rather than through Express.
  (
    notebookCollectionsContractRouter.listCollections as (args: unknown) => Promise<{
      status: number;
      body: { success?: boolean; collections?: Array<{ id: string; access_source?: string }> };
    }>
  )({
    req: { user: { id: userId }, originalUrl: '/api/auth/notebook-collections' },
  });

describe('listCollections — owned-only privacy guarantee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPg.query.mockResolvedValue([]);
  });

  it('returns only the caller-owned notebooks, all tagged access_source=owned', async () => {
    mockHelper.getUserNotebookCollections.mockResolvedValue([
      { id: 'mine-1', user_id: 'user-1', name: 'Mine 1' },
      { id: 'mine-2', user_id: 'user-1', name: 'Mine 2' },
    ]);

    const res = await callListCollections('user-1');

    expect(res.status).toBe(200);
    expect(mockHelper.getUserNotebookCollections).toHaveBeenCalledWith('user-1');
    const ids = (res.body.collections ?? []).map((c) => c.id).sort();
    expect(ids).toEqual(['mine-1', 'mine-2']);
    expect((res.body.collections ?? []).every((c) => c.access_source === 'owned')).toBe(true);
  });

  it('never fetches cross-user buckets (authenticated / by-ids)', async () => {
    mockHelper.getUserNotebookCollections.mockResolvedValue([]);

    await callListCollections('user-1');

    // The leak vector was pulling EVERY share_mode='authenticated' notebook (and
    // group-shared notebooks by id) into the personal list. Those calls must not
    // happen here anymore.
    expect(mockHelper.getNotebookCollectionsByShareMode).not.toHaveBeenCalled();
    expect(mockHelper.getNotebookCollectionsByIds).not.toHaveBeenCalled();
  });
});
