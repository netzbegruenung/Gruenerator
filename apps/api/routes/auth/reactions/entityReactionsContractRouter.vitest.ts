/**
 * Generic reaction endpoint: fresh summaries on 200, 403/404 straight from the
 * permission registry (nothing written then), 500 on a service error, and the
 * board live bump after add/remove on `board_comment` only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  queryOne: vi.fn(),
  findViewer: vi.fn(),
  checkBoardAccess: vi.fn(),
  bumpCardComments: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  getReactionSummaries: vi.fn(),
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ queryOne: m.queryOne }),
}));
vi.mock('../../../utils/adminAuthz.js', () => ({ isInstanceAdmin: vi.fn(async () => false) }));
vi.mock('../../../services/groups/groupFeed.js', () => ({ findViewer: m.findViewer }));
vi.mock('../../boards/boardAccess.js', () => ({ checkBoardAccess: m.checkBoardAccess }));
vi.mock('../../../services/boards/boardLiveSignalService.js', () => ({
  bumpCardComments: m.bumpCardComments,
}));
vi.mock('../../../services/entityReactions/EntityReactionsService.js', () => ({
  addReaction: m.addReaction,
  removeReaction: m.removeReaction,
  getReactionSummaries: m.getReactionSummaries,
}));

const { entityReactionsContractRouter } = await import('./entityReactionsContractRouter.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
type Name = 'addReaction' | 'removeReaction';
const call = (name: Name, entityType: string, entityId = ID) =>
  (entityReactionsContractRouter[name] as unknown as Handler)({
    req: { user: { id: 'viewer' } } as unknown as Request,
    params: { entityType, entityId, emoji: '👍' },
  });

const ID = '11111111-2222-4333-8444-555555555555';
const SUMMARY = [{ emoji: '👍', count: 1, reacted: true }];

beforeEach(() => {
  vi.clearAllMocks();
  m.queryOne.mockResolvedValue({ group_id: 'g1', board_id: 'b1', card_id: 'c1' });
  m.findViewer.mockResolvedValue({ isPersonal: false });
  m.checkBoardAccess.mockResolvedValue({ hasAccess: true, createdBy: 'owner' });
  m.getReactionSummaries.mockResolvedValue(new Map([[ID, SUMMARY]]));
});

describe.each(['addReaction', 'removeReaction'] as const)('%s', (name) => {
  const write = name === 'addReaction' ? m.addReaction : m.removeReaction;

  it('200 with the entity’s fresh summaries', async () => {
    const res = await call(name, 'group_share');
    expect(res).toEqual({ status: 200, body: { reactions: SUMMARY } });
    expect(write).toHaveBeenCalledWith('viewer', 'group_share', ID, '👍');
    expect(m.getReactionSummaries).toHaveBeenCalledWith('group_share', [ID], 'viewer');
  });

  it('200 with [] when the entity has no reactions left', async () => {
    m.getReactionSummaries.mockResolvedValue(new Map());
    expect(await call(name, 'group_comment')).toEqual({ status: 200, body: { reactions: [] } });
  });

  it('403 when the registry says forbidden, nothing written', async () => {
    m.findViewer.mockResolvedValue(null);
    const res = await call(name, 'group_comment');
    expect(res.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it('404 when the registry says not_found, nothing written', async () => {
    m.queryOne.mockResolvedValue(null);
    const res = await call(name, 'board_comment');
    expect(res.status).toBe(404);
    expect(write).not.toHaveBeenCalled();
    expect(m.bumpCardComments).not.toHaveBeenCalled();
  });

  it('500 on a service error, no bump', async () => {
    write.mockRejectedValueOnce(new Error('db down'));
    const res = await call(name, 'board_comment');
    expect(res.status).toBe(500);
    expect(m.bumpCardComments).not.toHaveBeenCalled();
  });

  it('board_comment bumps the card for other board viewers', async () => {
    const res = await call(name, 'board_comment');
    expect(res.status).toBe(200);
    expect(m.checkBoardAccess).toHaveBeenCalledWith('b1', 'viewer');
    expect(m.bumpCardComments).toHaveBeenCalledWith('b1', 'c1');
  });

  it.each(['group_share', 'group_comment'])('%s does not bump', async (type) => {
    expect((await call(name, type)).status).toBe(200);
    expect(m.bumpCardComments).not.toHaveBeenCalled();
  });
});
