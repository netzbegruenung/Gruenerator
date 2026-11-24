/**
 * Der Einladungslink ist ein dauerhaftes Geheimnis: wer ihn hat, tritt bei.
 * Ausgeliefert wird er deshalb nur an Admins des Projekts, und Admins können
 * ihn erneuern; der alte Link ist danach wertlos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const { db, getPostgresAndCheckMembership, regenerateJoinToken, isInstanceAdmin } = vi.hoisted(
  () => ({
    db: { query: vi.fn(), queryOne: vi.fn(), exec: vi.fn(), ensureInitialized: vi.fn() },
    getPostgresAndCheckMembership: vi.fn(),
    regenerateJoinToken: vi.fn(),
    isInstanceAdmin: vi.fn(),
  })
);

vi.mock('../../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => db,
}));
vi.mock('../groupCore.js', () => ({ getPostgresAndCheckMembership }));
vi.mock('../../../../utils/adminAuthz.js', () => ({ isInstanceAdmin }));
vi.mock('../../../../services/groups/groupMutations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  regenerateJoinToken,
}));

const { coreRoutes } = await import('./core.js');

type Handler = (args: Record<string, unknown>) => Promise<{ status: number; body: any }>;
const req = (userId: string) => ({ user: { id: userId } }) as unknown as Request;

const GROUP_ID = 'group-1';
const TOKEN = 'a'.repeat(32);

const groupRow = (over: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  name: 'KV Musterstadt',
  created_by: 'creator-1',
  join_token: TOKEN,
  is_system: false,
  member_count: 3,
  ...over,
});

beforeEach(() => {
  db.ensureInitialized.mockReset().mockResolvedValue(undefined);
  db.query.mockReset();
  db.queryOne.mockReset();
  isInstanceAdmin.mockReset().mockResolvedValue(false);
  regenerateJoinToken.mockReset();
  getPostgresAndCheckMembership.mockReset();
});

describe('who gets the invite link', () => {
  const list = (userId: string, role: string) => {
    db.query
      .mockResolvedValueOnce([{ group_id: GROUP_ID, role, joined_at: new Date() }])
      .mockResolvedValueOnce([groupRow()]);
    return (coreRoutes.listUserGroups as unknown as Handler)({ req: req(userId) });
  };
  const details = (userId: string, role: string) => {
    db.queryOne.mockResolvedValueOnce({ ...groupRow(), role, joined_at: new Date() });
    return (coreRoutes.getDetails as unknown as Handler)({
      req: req(userId),
      params: { groupId: GROUP_ID },
    });
  };

  it('hides it from plain members in the list and the details', async () => {
    expect((await list('member-1', 'member')).body.groups[0].join_token).toBeNull();
    expect((await details('member-1', 'member')).body.group.join_token).toBeNull();
  });

  it('returns it to admins and to the creator', async () => {
    expect((await list('admin-1', 'admin')).body.groups[0].join_token).toBe(TOKEN);
    expect((await details('admin-1', 'admin')).body.group.join_token).toBe(TOKEN);
    expect((await list('creator-1', 'member')).body.groups[0].join_token).toBe(TOKEN);
  });
});

describe('regenerateJoinToken', () => {
  const renew = (userId: string) =>
    (coreRoutes.regenerateJoinToken as unknown as Handler)({
      req: req(userId),
      params: { groupId: GROUP_ID },
      body: {},
    });

  it('refuses plain members and writes nothing', async () => {
    getPostgresAndCheckMembership.mockRejectedValue(new Error('Keine Berechtigung.'));
    expect((await renew('member-1')).status).toBe(403);
    expect(regenerateJoinToken).not.toHaveBeenCalled();
  });

  it('refuses the system project', async () => {
    getPostgresAndCheckMembership.mockResolvedValue({
      postgres: db,
      isAdmin: true,
      isSystem: true,
    });
    expect((await renew('admin-1')).status).toBe(400);
    expect(regenerateJoinToken).not.toHaveBeenCalled();
  });

  it('gives an admin a fresh link', async () => {
    getPostgresAndCheckMembership.mockResolvedValue({
      postgres: db,
      isAdmin: true,
      isSystem: false,
    });
    regenerateJoinToken.mockResolvedValue('b'.repeat(32));
    const res = await renew('admin-1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, join_token: 'b'.repeat(32) });
    expect(regenerateJoinToken).toHaveBeenCalledWith(GROUP_ID);
  });
});
