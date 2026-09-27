/**
 * Admin- und Teilen-Regeln der Mitgliedsprüfung, insbesondere die System-Gruppe:
 * dort zählen weder Gruppenrolle noch Gründer*in, nur Instanz-Admins.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryOne = vi.fn();
const query = vi.fn();
const isInstanceAdmin = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: async () => {}, queryOne, query }),
}));
vi.mock('../../utils/adminAuthz.js', () => ({
  isInstanceAdmin: (userId: string) => isInstanceAdmin(userId),
}));

const { assertCanShareToGroup, getPostgresAndCheckMembership, listShareTargetGroups } =
  await import('./groupMembership.js');

function membership(row: { role: string; created_by?: string | null; is_system?: boolean } | null) {
  queryOne.mockResolvedValue(row && { created_by: null, is_system: false, ...row });
}

beforeEach(() => {
  queryOne.mockReset();
  query.mockReset();
  isInstanceAdmin.mockReset().mockResolvedValue(false);
});

describe('getPostgresAndCheckMembership', () => {
  it('rejects non-members', async () => {
    membership(null);
    await expect(getPostgresAndCheckMembership('g', 'u')).rejects.toThrow('nicht Mitglied');
  });

  it('treats role admin and the creator as admin in normal groups', async () => {
    membership({ role: 'admin' });
    expect((await getPostgresAndCheckMembership('g', 'u', true)).isAdmin).toBe(true);
    membership({ role: 'member', created_by: 'u' });
    expect((await getPostgresAndCheckMembership('g', 'u', true)).isAdmin).toBe(true);
    membership({ role: 'member' });
    await expect(getPostgresAndCheckMembership('g', 'u', true)).rejects.toThrow('Berechtigung');
  });

  it('ignores role and creator in the system group', async () => {
    membership({ role: 'admin', created_by: 'u', is_system: true });
    await expect(getPostgresAndCheckMembership('g', 'u', true)).rejects.toThrow('Berechtigung');
    isInstanceAdmin.mockResolvedValue(true);
    const result = await getPostgresAndCheckMembership('g', 'u', true);
    expect(result).toMatchObject({ isAdmin: true, isSystem: true });
  });
});

describe('assertCanShareToGroup', () => {
  it('lets any member share into a normal group', async () => {
    membership({ role: 'member' });
    await expect(assertCanShareToGroup('g', 'u')).resolves.toMatchObject({ isSystem: false });
  });

  it('lets only instance admins share into the system group', async () => {
    membership({ role: 'member', is_system: true });
    await expect(assertCanShareToGroup('g', 'u')).rejects.toThrow('Berechtigung');
    isInstanceAdmin.mockResolvedValue(true);
    await expect(assertCanShareToGroup('g', 'u')).resolves.toMatchObject({ isAdmin: true });
  });
});

describe('listShareTargetGroups', () => {
  const rows = [
    { id: 'sys', name: 'Grünerator', role: 'member', is_system: true },
    { id: 'g1', name: 'Klima', role: 'admin', is_system: false },
  ];

  it('hides the system group from non-admins', async () => {
    query.mockResolvedValue(rows);
    expect(await listShareTargetGroups('u')).toEqual([{ id: 'g1', name: 'Klima', role: 'admin' }]);
  });

  it('offers the system group to instance admins', async () => {
    query.mockResolvedValue(rows);
    isInstanceAdmin.mockResolvedValue(true);
    expect((await listShareTargetGroups('u')).map((g) => g.id)).toEqual(['sys', 'g1']);
  });
});
