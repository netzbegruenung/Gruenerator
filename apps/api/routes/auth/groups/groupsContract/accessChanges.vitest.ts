/**
 * Project routes that take access away: removing or narrowing a shared item,
 * and leaving the project. Each closes the affected Hocuspocus rooms after its
 * write, because an open connection keeps the rights it was set up with.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const { getPostgresAndCheckMembership, closeShareRoom, closeGroupCollabRooms, db } = vi.hoisted(
  () => ({
    getPostgresAndCheckMembership: vi.fn(),
    closeShareRoom: vi.fn(),
    closeGroupCollabRooms: vi.fn(),
    db: { queryOne: vi.fn(), exec: vi.fn(), ensureInitialized: vi.fn() },
  })
);

vi.mock('../groupCore.js', () => ({ getPostgresAndCheckMembership }));
vi.mock('../../../../services/collab/collabRooms.js', () => ({
  closeShareRoom,
  closeGroupCollabRooms,
}));
vi.mock('../../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => db,
}));
vi.mock('../../../../services/notifications/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
}));

const { contentRoutes } = await import('./content.js');
const { coreRoutes } = await import('./core.js');

const GROUP_ID = 'group-1';
const SHARER = 'user-sharer';
const DOC_ID = 'doc-1';

type Handler = (args: Record<string, unknown>) => Promise<{ status: number }>;
const req = (userId: string) => ({ user: { id: userId } }) as unknown as Request;

/** Index (in call order) of the first statement matching `re`. */
const orderOf = (re: RegExp) => {
  const i = db.exec.mock.calls.findIndex(([sql]) => re.test(sql as string));
  return db.exec.mock.invocationCallOrder[i] ?? Infinity;
};

beforeEach(() => {
  closeShareRoom.mockReset().mockResolvedValue(undefined);
  closeGroupCollabRooms.mockReset().mockResolvedValue(undefined);
  db.queryOne.mockReset().mockResolvedValue({ shared_by_user_id: SHARER });
  db.exec.mockReset().mockResolvedValue({ changes: 1 });
  db.ensureInitialized.mockReset().mockResolvedValue(undefined);
  getPostgresAndCheckMembership.mockReset().mockResolvedValue({ postgres: db, isAdmin: true });
});

describe('shared content leaves the project or gets narrower', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    [
      'unshareContent',
      { body: { contentType: 'collaborative_documents', contentId: DOC_ID } },
      /DELETE FROM group_content_shares/,
    ],
    [
      'updateContentPermissions',
      {
        params: { groupId: GROUP_ID, contentId: DOC_ID },
        body: { contentType: 'collaborative_documents', permissions: { write: false } },
      },
      /UPDATE group_content_shares/,
    ],
    [
      'removeGroupContent',
      {
        params: { groupId: GROUP_ID, contentId: DOC_ID },
        body: { contentType: 'collaborative_documents' },
      },
      /DELETE FROM group_content_shares/,
    ],
  ];

  it.each(cases)('%s closes the room after the write', async (name, args, write) => {
    const handler = contentRoutes[name as keyof typeof contentRoutes] as unknown as Handler;
    const res = await handler({ req: req(SHARER), params: { groupId: GROUP_ID }, ...args });

    expect(res.status).toBe(200);
    expect(closeShareRoom).toHaveBeenCalledWith('collaborative_documents', DOC_ID);
    expect(closeShareRoom.mock.invocationCallOrder[0]).toBeGreaterThan(orderOf(write));
  });

  it.each(cases)('%s closes nothing when the share is missing', async (name, args) => {
    db.queryOne.mockResolvedValue(null);
    const handler = contentRoutes[name as keyof typeof contentRoutes] as unknown as Handler;
    const res = await handler({ req: req(SHARER), params: { groupId: GROUP_ID }, ...args });

    expect(res.status).toBe(404);
    expect(closeShareRoom).not.toHaveBeenCalled();
  });
});

describe('leaveGroup', () => {
  const leave = (userId: string) =>
    (coreRoutes.leaveGroup as unknown as Handler)({
      req: req(userId),
      params: { groupId: GROUP_ID },
    });

  it("closes the leaver's connections to the project's rooms after the membership is gone", async () => {
    db.queryOne.mockResolvedValue({
      role: 'member',
      created_by: 'someone-else',
      name: 'KV Musterstadt',
      is_system: false,
    });

    const res = await leave('user-leaving');

    expect(res.status).toBe(200);
    expect(closeGroupCollabRooms).toHaveBeenCalledWith(GROUP_ID, 'user-leaving');
    expect(closeGroupCollabRooms.mock.invocationCallOrder[0]).toBeGreaterThan(
      orderOf(/DELETE FROM group_memberships/)
    );
  });

  it('closes nothing when the user may not leave', async () => {
    db.queryOne.mockResolvedValue({
      role: 'admin',
      created_by: 'creator-1',
      name: 'KV Musterstadt',
      is_system: false,
    });

    const res = await leave('creator-1');

    expect(res.status).toBe(400);
    expect(closeGroupCollabRooms).not.toHaveBeenCalled();
  });
});
