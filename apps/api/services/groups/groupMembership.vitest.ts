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

function membership(
  row: {
    role: string;
    created_by?: string | null;
    is_system?: boolean;
    archived_at?: string | null;
  } | null
) {
  queryOne.mockResolvedValue(
    row && { created_by: null, is_system: false, archived_at: null, ...row }
  );
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

describe('archived projects are read-only', () => {
  it('rejects shares and filing into an archived project, even for admins', async () => {
    membership({ role: 'admin', archived_at: '2026-11-22T10:00:00Z' });
    await expect(assertCanShareToGroup('g', 'u')).rejects.toThrow('archiviert');
  });

  it('still lets members read it (the membership check passes, flagged archived)', async () => {
    membership({ role: 'member', archived_at: '2026-11-22T10:00:00Z' });
    await expect(getPostgresAndCheckMembership('g', 'u')).resolves.toMatchObject({
      isArchived: true,
    });
  });

  it('leaves archived projects out of the share-target list', async () => {
    query.mockResolvedValue([]);
    await listShareTargetGroups('u');
    expect(query.mock.calls[0][0]).toContain('g.archived_at IS NULL');
  });
});

describe('listShareTargetGroups', () => {
  const rows = [
    { id: 'sys', name: 'Grünerator', role: 'member', is_system: true },
    { id: 'g1', name: 'Klima', role: 'admin', is_system: false },
  ];

  it('hides the system group from non-admins', async () => {
    query.mockResolvedValue(rows);
    expect(await listShareTargetGroups('u')).toEqual([
      { id: 'g1', name: 'Klima', role: 'admin', team: true },
    ]);
  });

  it('offers the system group to instance admins', async () => {
    query.mockResolvedValue(rows);
    isInstanceAdmin.mockResolvedValue(true);
    expect((await listShareTargetGroups('u')).map((g) => g.id)).toEqual(['sys', 'g1']);
  });

  it('marks every project as team, except the system project', async () => {
    query.mockResolvedValue([
      ...rows,
      { id: 'me', name: 'Meins', role: 'admin', is_system: false, group_type: 'personal' },
    ]);
    isInstanceAdmin.mockResolvedValue(true);
    const team = Object.fromEntries((await listShareTargetGroups('u')).map((g) => [g.id, g.team]));
    expect(team).toEqual({ sys: false, g1: true, me: true });
  });
});
