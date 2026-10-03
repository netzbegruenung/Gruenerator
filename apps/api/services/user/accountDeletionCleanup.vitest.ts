/**
 * Account deletion clears what no FK cascade reaches (#3845, #3850): the
 * sole-owned documents, the user's notebooks in Qdrant with their likes, the
 * user's own likes, and every Nango connection — a token left behind would keep
 * reading the deleted person's OneDrive/Drive. One failing item never blocks
 * the rest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
const purgeSoleOwnedCollaborativeDocuments = vi.fn(async () => {
  effects.push('purge documents');
  return 2;
});
const listAllNotebookIdsOfUser = vi.fn(async () => ['nb-1', 'nb-2']);
const deleteNotebookCollection = vi.fn(async (id: string) => {
  effects.push(`delete notebook ${id}`);
  return { success: true };
});
const deleteLikesForEntity = vi.fn(async (type: string, id: string) => {
  effects.push(`likes ${type} ${id}`);
});
const deleteLikesOfDeletedUser = vi.fn(async (userId: string) => {
  effects.push(`likes of ${userId}`);
});
const reportBackgroundError = vi.fn();
const env: Record<string, string | undefined> = {};
const listConnections = vi.fn(async () => ({
  connections: [
    { provider_config_key: 'microsoft', connection_id: 'c-ms' },
    { provider_config_key: 'google', connection_id: 'c-g' },
  ],
}));
const deleteConnection = vi.fn(async (provider: string, id: string) => {
  effects.push(`nango ${provider} ${id}`);
});

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    listAllNotebookIdsOfUser = listAllNotebookIdsOfUser;
    deleteNotebookCollection = deleteNotebookCollection;
  },
}));
vi.mock('../docs/CollaborativeDocumentService.js', () => ({
  purgeSoleOwnedCollaborativeDocuments,
}));
vi.mock('../entityLikes/EntityLikesService.js', () => ({
  deleteLikesForEntity,
  deleteLikesOfDeletedUser,
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));
vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../config/nango.js', () => ({
  getNango: () => ({ listConnections, deleteConnection }),
  HIDDEN_NANGO_PROVIDERS: new Set(),
  NANGO_PROVIDERS: {},
}));

const { cleanUpBeforeProfileDelete } = await import('./accountDeletionCleanup.js');

beforeEach(() => {
  effects.length = 0;
  vi.clearAllMocks();
  env.NANGO_SECRET_KEY = 'secret';
});

describe('cleanUpBeforeProfileDelete', () => {
  it('removes documents, every notebook with its likes, then the user’s likes', async () => {
    await cleanUpBeforeProfileDelete('user-1');

    expect(listAllNotebookIdsOfUser).toHaveBeenCalledWith('user-1');
    expect(effects).toEqual([
      'purge documents',
      'delete notebook nb-1',
      'likes notebook nb-1',
      'delete notebook nb-2',
      'likes notebook nb-2',
      'likes of user-1',
      'nango microsoft c-ms',
      'nango google c-g',
    ]);
    expect(listConnections).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('keeps a notebook’s likes when the notebook itself could not be deleted', async () => {
    deleteNotebookCollection.mockRejectedValueOnce(new Error('qdrant down'));

    await cleanUpBeforeProfileDelete('user-1');

    expect(effects).not.toContain('likes notebook nb-1');
    expect(effects).toContain('delete notebook nb-2');
    expect(effects).toContain('likes of user-1');
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'account-deletion', kind: 'notebook', id: 'nb-1' })
    );
  });

  it('still clears the likes when Qdrant cannot list the notebooks', async () => {
    listAllNotebookIdsOfUser.mockRejectedValueOnce(new Error('qdrant down'));

    await cleanUpBeforeProfileDelete('user-1');

    expect(deleteNotebookCollection).not.toHaveBeenCalled();
    expect(effects).toContain('likes of user-1');
  });

  it('deletes the remaining connections when one Nango delete fails, and reports it', async () => {
    deleteConnection.mockRejectedValueOnce(new Error('nango 500'));

    await cleanUpBeforeProfileDelete('user-1');

    expect(effects).toContain('nango google c-g');
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(AggregateError),
      expect.objectContaining({ job: 'account-deletion', store: 'nango' })
    );
  });

  it('reports a Nango outage instead of treating it as "nothing connected"', async () => {
    listConnections.mockRejectedValueOnce(new Error('nango down'));

    await cleanUpBeforeProfileDelete('user-1');

    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'nango down' }),
      expect.objectContaining({ store: 'nango' })
    );
    expect(effects).toContain('likes of user-1');
  });

  it('skips Nango on an instance without it', async () => {
    env.NANGO_SECRET_KEY = undefined;

    await cleanUpBeforeProfileDelete('user-1');

    expect(listConnections).not.toHaveBeenCalled();
  });
});
