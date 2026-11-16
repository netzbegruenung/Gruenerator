/**
 * `create` with a `groupId`: the thread is filed in the Projekt AT creation, so
 * its first turn already reads the Projekt context. The gate is the one the
 * PATCH uses (`assertCanShareToGroup`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const assertCanShare = vi.fn();
const insertThread = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../../services/groups/groupMembership.js', () => ({
  assertCanShareToGroup: (groupId: string, userId: string) => assertCanShare(groupId, userId),
}));
vi.mock('../../services/chat/threadRecallEmbeddingService.js', () => ({}));
vi.mock('../../services/chat/threadTitleService.js', () => ({}));
vi.mock('./services/attachmentPersistenceService.js', () => ({}));
vi.mock('./services/threadPersistenceService.js', () => ({
  getThreadSettings: vi.fn(),
  updateThreadSettings: vi.fn(),
  insertThreadWithSlugRetry: (...args: unknown[]) => insertThread(...args),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const req = { user: { id: 'user-1' } } as unknown as Request;
const GROUP = '73023915-b1b6-4bea-9046-4cf0784561df';

function createdRow() {
  return [
    {
      id: 't1',
      user_id: 'user-1',
      agent_id: 'gruenerator-universal',
      title: null,
      slug_suffix: 'abc123',
      created_at: new Date('2026-11-13T10:00:00Z'),
      updated_at: new Date('2026-11-13T10:00:00Z'),
    },
  ];
}

describe('threads create with groupId', () => {
  beforeEach(() => {
    assertCanShare.mockReset().mockResolvedValue({});
    insertThread.mockReset().mockImplementation(async (run: (slug: string) => unknown) => {
      await run('abc123');
      return createdRow();
    });
  });

  it('files the thread into the Projekt in the INSERT itself', async () => {
    const res = await threadsContractRouter.create({
      req,
      body: { threadType: 'chat', groupId: GROUP },
    } as never);

    expect(res.status).toBe(201);
    expect(assertCanShare).toHaveBeenCalledWith(GROUP, 'user-1');
    expect(insertThread).toHaveBeenCalledTimes(1);
  });

  it('refuses a Projekt the person may not share into, and creates nothing', async () => {
    assertCanShare.mockRejectedValue(new Error('Du bist nicht Mitglied dieser Gruppe.'));

    const res = await threadsContractRouter.create({ req, body: { groupId: GROUP } } as never);

    expect(res.status).toBe(403);
    expect(insertThread).not.toHaveBeenCalled();
  });

  it('skips the gate for a plain chat', async () => {
    const res = await threadsContractRouter.create({ req, body: {} } as never);

    expect(res.status).toBe(201);
    expect(assertCanShare).not.toHaveBeenCalled();
  });
});
