/**
 * Ein Projekt im Papierkorb gibt keinen Zugriff mehr auf das, was mit ihm
 * geteilt ist. Offene Hocuspocus-Verbindungen behalten aber die Rechte, mit
 * denen sie aufgebaut wurden — `trashGroup` schließt deshalb nach dem
 * Schreiben die Räume des Projekts, für alle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, closeGroupCollabRooms } = vi.hoisted(() => ({
  db: { queryOne: vi.fn(), query: vi.fn() },
  closeGroupCollabRooms: vi.fn(),
}));

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => db }));
vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: vi.fn() }));
vi.mock('../notifications/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../collab/collabRooms.js', () => ({ closeGroupCollabRooms }));

const { trashGroup } = await import('./groupTrash.js');

const GROUP_ID = '550e8400-e29b-41d4-a716-446655440009';
const CREATOR = 'creator-1';

beforeEach(() => {
  closeGroupCollabRooms.mockReset().mockResolvedValue(undefined);
  db.queryOne.mockReset().mockResolvedValue({
    name: 'KV Musterstadt',
    created_by: CREATOR,
    group_type: 'kv',
    is_system: false,
  });
  db.query.mockReset().mockResolvedValue([{ members: 3 }]);
});

describe('trashGroup', () => {
  it('schließt die Räume des Projekts nach dem Schreiben', async () => {
    expect(await trashGroup(CREATOR, GROUP_ID)).toBe('ok');

    expect(closeGroupCollabRooms).toHaveBeenCalledWith(GROUP_ID, null);
    const update = db.query.mock.calls.findIndex(([sql]) =>
      /UPDATE groups SET deleted_at = now\(\)/.test(sql as string)
    );
    expect(closeGroupCollabRooms.mock.invocationCallOrder[0]).toBeGreaterThan(
      db.query.mock.invocationCallOrder[update] ?? Infinity
    );
  });

  it('schließt nichts, wenn das Löschen nicht erlaubt ist', async () => {
    db.queryOne.mockImplementation(async (sql: string) =>
      /FROM group_memberships/.test(sql)
        ? { role: 'member' }
        : { name: 'KV', created_by: CREATOR, group_type: 'kv', is_system: false }
    );

    expect(await trashGroup('member-2', GROUP_ID)).toBe('forbidden');
    expect(closeGroupCollabRooms).not.toHaveBeenCalled();
  });

  it('schließt nichts, wenn das Projekt schon weg ist', async () => {
    db.query.mockResolvedValue([]);
    expect(await trashGroup(CREATOR, GROUP_ID)).toBe('not_found');
    expect(closeGroupCollabRooms).not.toHaveBeenCalled();
  });
});
