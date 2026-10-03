/**
 * Board comment reactions live in `entity_reactions` (`board_comment`): the
 * legacy row list keeps its shape, `reactionSummaries` is added for the viewer,
 * and the legacy endpoints keep their status codes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const { query, checkBoardAccess, addReaction, removeReaction, getReactionRows } = vi.hoisted(
  () => ({
    query: vi.fn(),
    checkBoardAccess: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    getReactionRows: vi.fn(),
  })
);

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: vi.fn() }));
vi.mock('./boardAccess.js', () => ({ checkBoardAccess }));
vi.mock('../../services/entityReactions/EntityReactionsService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  addReaction,
  removeReaction,
  getReactionRows,
}));
vi.mock('../../services/boards/agentTaskService.js', () => ({ enqueueAgentTask: vi.fn() }));
vi.mock('../../services/boards/boardLiveSignalService.js', () => ({ bumpCardComments: vi.fn() }));
vi.mock('../../services/boards/BoardService.js', () => ({
  buildCardEmailMetadata: vi.fn(async () => ({})),
}));
vi.mock('../../services/boards/cardActivityService.js', () => ({ recordCardActivity: vi.fn() }));
vi.mock('../../services/boards/cardSubscriptionService.js', () => ({ autoSubscribe: vi.fn() }));
vi.mock('../../services/notifications/NotificationService.js', () => ({
  createNotification: vi.fn(async () => null),
}));

const { boardCommentsContractRouter } = await import('./boardCommentsContractRouter.js');
const { GRUENERATOR_BOT_USER_ID } = await import('../../services/boards/grueneratorBot.js');
const { enqueueAgentTask } = await import('../../services/boards/agentTaskService.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const handler = (name: keyof typeof boardCommentsContractRouter) =>
  boardCommentsContractRouter[name] as unknown as Handler;

const req = (id = 'viewer') => ({ user: { id } }) as unknown as Request;
const at = (iso: string) => new Date(iso);

const reaction = (id: string, commentId: string, userId: string, emoji: string, iso: string) => ({
  id,
  group_share_id: null,
  group_comment_id: null,
  board_comment_id: commentId,
  user_id: userId,
  emoji,
  created_at: at(iso),
});

const commentRow = (id: string, parentId: string | null = null) => ({
  id,
  board_id: 'board-1',
  card_id: 'card-1',
  parent_id: parentId,
  user_id: 'author',
  content: 'hi',
  blocks: [],
  mentioned_user_ids: [],
  is_edited: false,
  edited_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  author_name: 'A',
  author_avatar_robot_id: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  checkBoardAccess.mockResolvedValue({ hasAccess: true, boardTitle: 'B', createdBy: 'owner' });
  query.mockResolvedValue([]);
});

describe('listComments', () => {
  it('synthesizes legacy rows and viewer summaries from one reaction query', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('bc.parent_id IS NULL')) return [{ ...commentRow('c1'), reply_count: 1 }];
      if (sql.includes('bc.parent_id = ANY')) return [commentRow('r1', 'c1')];
      return [];
    });
    getReactionRows.mockResolvedValue([
      reaction('x1', 'c1', 'other', '💡', '2026-09-01T10:00:00Z'),
      reaction('x2', 'c1', 'viewer', '👍', '2026-09-01T10:01:00Z'),
      reaction('x3', 'c1', 'other', '👍', '2026-09-01T10:02:00Z'),
      reaction('x4', 'r1', 'other', '🎉', '2026-09-01T10:03:00Z'),
    ]);

    const res = await handler('listComments')({
      req: req(),
      params: { boardId: 'board-1', cardId: 'card-1' },
    });

    expect(res.status).toBe(200);
    expect(getReactionRows).toHaveBeenCalledTimes(1);
    expect(getReactionRows).toHaveBeenCalledWith('board_comment', ['c1', 'r1']);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('board_comment_reactions'))).toBe(
      false
    );
    const [comment] = res.body as Array<Record<string, unknown>>;
    expect(comment.reactions).toEqual([
      {
        id: 'x1',
        comment_id: 'c1',
        user_id: 'other',
        emoji: '💡',
        created_at: '2026-09-01T10:00:00.000Z',
      },
      expect.objectContaining({ id: 'x2', user_id: 'viewer', emoji: '👍' }),
      expect.objectContaining({ id: 'x3', user_id: 'other', emoji: '👍' }),
    ]);
    expect(comment.reactionSummaries).toEqual([
      { emoji: '💡', count: 1, reacted: false },
      { emoji: '👍', count: 2, reacted: true },
    ]);
    const [reply] = comment.replies as Array<Record<string, unknown>>;
    expect(reply.reactions).toEqual([expect.objectContaining({ id: 'x4', comment_id: 'r1' })]);
    expect(reply.reactionSummaries).toEqual([{ emoji: '🎉', count: 1, reacted: false }]);
  });

  it('comments without reactions get empty lists', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('bc.parent_id IS NULL') ? [commentRow('c1')] : []
    );
    getReactionRows.mockResolvedValue([]);

    const res = await handler('listComments')({
      req: req(),
      params: { boardId: 'board-1', cardId: 'card-1' },
    });
    const [comment] = res.body as Array<Record<string, unknown>>;
    expect(comment.reactions).toEqual([]);
    expect(comment.reactionSummaries).toEqual([]);
  });
});

describe('createComment (bot 👍)', () => {
  it('writes the bot reaction through entity_reactions and returns both shapes', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO board_comments')) return [commentRow('c9')];
      return [];
    });
    addReaction.mockResolvedValue(
      reaction('bot-r', 'c9', GRUENERATOR_BOT_USER_ID, '👍', '2026-09-01T11:00:00Z')
    );

    const res = await handler('createComment')({
      req: req(),
      params: { boardId: 'board-1', cardId: 'card-1' },
      body: { blocks: [{ type: 'mention', userId: GRUENERATOR_BOT_USER_ID, displayName: 'G' }] },
    });

    expect(res.status).toBe(201);
    expect(addReaction).toHaveBeenCalledWith(GRUENERATOR_BOT_USER_ID, 'board_comment', 'c9', '👍');
    const body = res.body as Record<string, unknown>;
    expect(body.reactions).toEqual([
      {
        id: 'bot-r',
        comment_id: 'c9',
        user_id: GRUENERATOR_BOT_USER_ID,
        emoji: '👍',
        created_at: '2026-09-01T11:00:00.000Z',
      },
    ]);
    expect(body.reactionSummaries).toEqual([{ emoji: '👍', count: 1, reacted: false }]);
  });
});

describe('createComment (bot delegation locale)', () => {
  it('takes de-AT from the X-User-Locale header when the profile has no country', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO board_comments')) return [commentRow('c9')];
      if (sql.includes('SELECT locale FROM profiles')) return [{ locale: null }];
      return [];
    });
    vi.mocked(enqueueAgentTask).mockResolvedValue({ id: 't1' } as never);

    await handler('createComment')({
      req: { user: { id: 'viewer' }, headers: { 'x-user-locale': 'de-AT' } } as unknown as Request,
      params: { boardId: 'board-1', cardId: 'card-1' },
      body: { blocks: [{ type: 'mention', userId: GRUENERATOR_BOT_USER_ID, displayName: 'G' }] },
    });

    await vi.waitFor(() =>
      expect(enqueueAgentTask).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de-AT' }))
    );
  });
});

describe('addReaction (legacy endpoint)', () => {
  const add = (emoji = '💡') =>
    handler('addReaction')({
      req: req(),
      params: { boardId: 'board-1', commentId: 'c1' },
      body: { emoji },
    });

  it('201 with the legacy row when newly added', async () => {
    query.mockResolvedValue([{ card_id: 'card-1' }]);
    addReaction.mockResolvedValue(reaction('n1', 'c1', 'viewer', '💡', '2026-09-01T12:00:00Z'));

    const res = await add();
    expect(res).toEqual({
      status: 201,
      body: {
        id: 'n1',
        comment_id: 'c1',
        user_id: 'viewer',
        emoji: '💡',
        created_at: '2026-09-01T12:00:00.000Z',
      },
    });
    expect(addReaction).toHaveBeenCalledWith('viewer', 'board_comment', 'c1', '💡');
  });

  it('200 already_exists on a duplicate', async () => {
    query.mockResolvedValue([{ card_id: 'card-1' }]);
    addReaction.mockResolvedValue(null);
    expect(await add()).toEqual({ status: 200, body: { already_exists: true } });
  });

  it('403 without writing when the comment is not on this board', async () => {
    query.mockResolvedValue([]);
    expect((await add()).status).toBe(403);
    expect(addReaction).not.toHaveBeenCalled();
  });

  it('403 without board access', async () => {
    checkBoardAccess.mockResolvedValue({ hasAccess: false });
    expect((await add()).status).toBe(403);
    expect(addReaction).not.toHaveBeenCalled();
  });
});

describe('removeReaction (legacy endpoint)', () => {
  it('removes through entity_reactions, any emoji', async () => {
    const res = await handler('removeReaction')({
      req: req(),
      params: { boardId: 'board-1', commentId: 'c1', emoji: encodeURIComponent('💡') },
    });
    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(removeReaction).toHaveBeenCalledWith('viewer', 'board_comment', 'c1', '💡');
  });
});
