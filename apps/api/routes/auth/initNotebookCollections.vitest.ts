/**
 * `/auth/init` seeds the web query `['notebookCollections', userId]` — the
 * same key `listCollections` fills. It used to build its own, thinner list (no
 * `indexing_state`, documents without `status`), so whichever wrote last won
 * (#4146). This locks the seed to the exact `listCollections` body.
 *
 * Run: `pnpm --filter @gruenerator/api exec vitest run routes/auth/initNotebookCollections.vitest.ts`
 */

import { describe, expect, it, vi } from 'vitest';

const mockHelper = vi.hoisted(() => ({
  getUserNotebookCollections: vi.fn(async () => [
    {
      id: 'nb-1',
      user_id: 'user-1',
      name: 'Presseschau',
      notebook_collection_documents: [{ document_id: 'doc-1' }],
    },
  ]),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return mockHelper;
  },
}));

// A document still being processed: the old init shape dropped `status` and
// `indexing_state`, so this notebook looked ready until the list refetched.
const mockPg = vi.hoisted(() => ({
  query: vi.fn(async (sql: string): Promise<unknown[]> =>
    sql.includes('FROM documents')
      ? [{ id: 'doc-1', title: 'Rede', status: 'processing', metadata: {}, vector_count: null }]
      : []
  ),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));

vi.mock('../../middleware/authMiddleware.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../workplace/recentActivityController.js', () => ({
  aggregateRecentActivity: vi.fn(async () => []),
}));
vi.mock('../../services/usage/ItemUsageService.js', () => ({
  getUsageMap: vi.fn(async () => new Map()),
}));
vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: vi.fn(async () => null) }),
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

import { notebookCollectionsContractRouter } from '../notebook/notebookCollectionsContractRouter.js';

import initRouter from './initController.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

async function callInit(userId: string) {
  // The GET handler sits after `requireAuth` on the router's only route.
  const layer = (
    initRouter as unknown as { stack: Array<{ route: { stack: Array<{ handle: Handler }> } }> }
  ).stack[0];
  const handle = layer.route.stack.at(-1)!.handle;
  let body: { notebookCollections?: unknown } = {};
  await handle(
    { user: { id: userId } },
    { json: (b: typeof body) => (body = b), status: () => ({ json: vi.fn() }) }
  );
  return body;
}

const callListCollections = (userId: string) =>
  (
    notebookCollectionsContractRouter.listCollections as (
      args: unknown
    ) => Promise<{ body: { collections?: unknown[] } }>
  )({ req: { user: { id: userId }, originalUrl: '/api/auth/notebook-collections' } });

describe('/auth/init notebook seed', () => {
  it('is exactly the listCollections list, readiness included', async () => {
    const init = await callInit('user-1');
    const list = await callListCollections('user-1');

    expect(init.notebookCollections).toEqual(list.body.collections);
    expect(init.notebookCollections).toMatchObject([
      {
        id: 'nb-1',
        indexing_state: 'indexing',
        documents: [{ id: 'doc-1', status: 'processing' }],
      },
    ]);
  });
});
