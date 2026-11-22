import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createGroupForUser, joinGroupByToken, removeGroupMember } from './groupMutations.js';

// --- mocked infra (lazy refs so vi.mock hoisting is safe) --------------------
const ensureInitialized = vi.fn();
const queryOne = vi.fn();
const exec = vi.fn();
const transaction = vi.fn();
const transactionQueryOne = vi.fn();
const transactionExec = vi.fn();
const notifyGroupMembers = vi.fn();
const query = vi.fn();
const checkMembership = vi.fn();
const dismissGroup = vi.fn();
const closeGroupCollabRooms = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    ensureInitialized: (...a: unknown[]) => ensureInitialized(...a),
    queryOne: (...a: unknown[]) => queryOne(...a),
    query: (...a: unknown[]) => query(...a),
    exec: (...a: unknown[]) => exec(...a),
    transaction: (fn: (client: unknown) => unknown) => transaction(fn),
    transactionQueryOne: (...a: unknown[]) => transactionQueryOne(...a),
    transactionExec: (...a: unknown[]) => transactionExec(...a),
  }),
}));
vi.mock('./groupMembership.js', () => ({
  getPostgresAndCheckMembership: (...a: unknown[]) => checkMembership(...a),
}));
vi.mock('../notifications/NotificationService.js', () => ({
  dismissGroup: (...a: unknown[]) => dismissGroup(...a),
}));
vi.mock('../collab/collabRooms.js', () => ({
  closeGroupCollabRooms: (...a: unknown[]) => closeGroupCollabRooms(...a),
}));
vi.mock('../notifications/index.js', () => ({
  notifyGroupMembers: (...a: unknown[]) => notifyGroupMembers(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  ensureInitialized.mockResolvedValue(undefined);
  notifyGroupMembers.mockResolvedValue(undefined);
  // Run the transaction body against a dummy client.
  transaction.mockImplementation((fn: (client: unknown) => unknown) => fn({}));
});

describe('createGroupForUser', () => {
  it('inserts the group + admin membership, trims the name and persists the description', async () => {
    transactionQueryOne.mockResolvedValue({
      id: 'g1',
      name: 'Klima-AG',
      description: 'desc',
      created_at: null,
      created_by: 'u1',
      join_token: 'tok',
      slug_suffix: 'ab12',
    });

    const group = await createGroupForUser('u1', { name: '  Klima-AG  ', description: 'desc' });

    expect(group.id).toBe('g1');
    const insertParams = transactionQueryOne.mock.calls[0][2] as unknown[];
    expect(insertParams[1]).toBe('Klima-AG'); // name trimmed
    expect(insertParams[2]).toBe('u1'); // created_by
    expect(insertParams[4]).toBe('desc'); // description persisted (old handler hard-coded null)
    expect(transactionExec).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('INSERT INTO group_memberships'),
      ['g1', 'u1', 'admin']
    );
  });

  it('defaults a missing description to null', async () => {
    transactionQueryOne.mockResolvedValue({
      id: 'g2',
      name: 'Ortsverband',
      description: null,
      created_at: null,
      created_by: 'u1',
      join_token: 'tok',
      slug_suffix: 'cd34',
    });

    await createGroupForUser('u1', { name: 'Ortsverband' });

    const insertParams = transactionQueryOne.mock.calls[0][2] as unknown[];
    expect(insertParams[4]).toBeNull();
  });
});

describe('joinGroupByToken', () => {
  it('returns null for an unknown token and does not write', async () => {
    queryOne.mockResolvedValueOnce(null); // getGroupByToken lookup
    const out = await joinGroupByToken('u1', 'bad', 'Mia');
    expect(out).toBeNull();
    expect(exec).not.toHaveBeenCalled();
    expect(notifyGroupMembers).not.toHaveBeenCalled();
  });

  it('is idempotent for an existing member (no insert, no notification)', async () => {
    queryOne
      .mockResolvedValueOnce({ id: 'g1', name: 'Klima' }) // getGroupByToken
      .mockResolvedValueOnce({ group_id: 'g1' }); // existing membership
    const out = await joinGroupByToken('u1', 'tok', 'Mia');
    expect(out).toEqual({ group: { id: 'g1', name: 'Klima' }, alreadyMember: true });
    expect(exec).not.toHaveBeenCalled();
    expect(notifyGroupMembers).not.toHaveBeenCalled();
  });

  it('inserts a member membership and notifies for a new join', async () => {
    queryOne
      .mockResolvedValueOnce({ id: 'g1', name: 'Klima' }) // getGroupByToken
      .mockResolvedValueOnce(null); // no existing membership
    exec.mockResolvedValue(undefined);

    const out = await joinGroupByToken('u1', 'tok', 'Mia');

    expect(out).toEqual({ group: { id: 'g1', name: 'Klima' }, alreadyMember: false });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO group_memberships'), [
      'g1',
      'u1',
      'member',
    ]);
    expect(notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'g1', type: 'group_member_joined', excludeUserId: 'u1' })
    );
  });
});

describe('removeGroupMember', () => {
  const member = (user_id: string, role: string, created_by = 'creator') => ({
    user_id,
    role,
    created_by,
    name: 'Klima-AG',
  });
  const postgres = {
    query: (...a: unknown[]) => query(...a),
    exec: (...a: unknown[]) => exec(...a),
  };

  beforeEach(() => {
    checkMembership.mockResolvedValue({ postgres, isAdmin: true, isSystem: false });
    dismissGroup.mockResolvedValue(undefined);
    exec.mockResolvedValue({ changes: 1 });
    query.mockResolvedValue([
      member('creator', 'admin'),
      member('admin2', 'admin'),
      member('m1', 'member'),
    ]);
  });

  it('removes a plain member, closes collab rooms and clears their notifications', async () => {
    const out = await removeGroupMember('g1', 'admin2', 'm1');
    expect(out).toMatchObject({ status: 200, success: true, groupName: 'Klima-AG' });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM group_memberships'), [
      'g1',
      'm1',
    ]);
    expect(closeGroupCollabRooms).toHaveBeenCalledWith('g1', 'm1');
    expect(dismissGroup).toHaveBeenCalledWith('group:g1', 'm1');
  });

  it('requires admin rights (the membership gate throws for non-admins)', async () => {
    checkMembership.mockRejectedValue(new Error('Keine Berechtigung für diese Aktion.'));
    const out = await removeGroupMember('g1', 'm1', 'm2');
    expect(out.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses to remove oneself', async () => {
    const out = await removeGroupMember('g1', 'admin2', 'admin2');
    expect(out.status).toBe(400);
    expect(checkMembership).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses in the system project', async () => {
    checkMembership.mockResolvedValue({ postgres, isAdmin: true, isSystem: true });
    const out = await removeGroupMember('g1', 'admin2', 'm1');
    expect(out.status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses to remove the creator', async () => {
    const out = await removeGroupMember('g1', 'admin2', 'creator');
    expect(out.status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses to remove the last admin', async () => {
    query.mockResolvedValue([member('x', 'admin', 'someone-else'), member('m1', 'member')]);
    const out = await removeGroupMember('g1', 'creator', 'x');
    expect(out).toMatchObject({
      status: 400,
      message: 'Der letzte Admin kann nicht entfernt werden.',
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('answers 404 for someone who is not a member', async () => {
    const out = await removeGroupMember('g1', 'admin2', 'ghost');
    expect(out.status).toBe(404);
    expect(exec).not.toHaveBeenCalled();
  });
});
