/**
 * Account deletion clears what no FK cascade reaches (#3845, #3850): the
 * sole-owned documents, the user's notebooks in Qdrant with their likes, and
 * the user's own likes. One failing item never blocks the rest.
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
const collectDoomedBoardCommentIds = vi.fn(async (selector: { authorId: string }) => {
  effects.push(`collect comments of ${selector.authorId}`);
  return ['c-1', 'r-1'];
});
const deleteBoardCommentReactions = vi.fn(async (ids: string[]) => {
  effects.push(`comment reactions ${ids.join(',')}`);
});
const reportBackgroundError = vi.fn();

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
vi.mock('../boards/boardCommentReactions.js', () => ({
  collectDoomedBoardCommentIds,
  deleteBoardCommentReactions,
}));
vi.mock('../entityLikes/EntityLikesService.js', () => ({
  deleteLikesForEntity,
  deleteLikesOfDeletedUser,
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const { cleanUpBeforeProfileDelete } = await import('./accountDeletionCleanup.js');

beforeEach(() => {
  effects.length = 0;
  vi.clearAllMocks();
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
      'collect comments of user-1',
      'comment reactions c-1,r-1',
      'likes of user-1',
    ]);
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

  it('still clears the likes when the board comment reactions fail', async () => {
    deleteBoardCommentReactions.mockRejectedValueOnce(new Error('pg down'));

    await cleanUpBeforeProfileDelete('user-1');

    expect(effects).toContain('likes of user-1');
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'account-deletion', store: 'board_comment_reactions' })
    );
  });
});
