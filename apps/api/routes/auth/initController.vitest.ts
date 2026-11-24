/** `/api/auth/init` liefert den Einladungslink nur an Admins, nie für das System-Projekt. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../middleware/authMiddleware.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../../services/user/ProfileService.js', () => ({ getProfileService: vi.fn() }));
vi.mock('../notebook/notebookCollectionsContractRouter.js', () => ({
  listOwnedNotebookCollections: vi.fn(),
}));
vi.mock('../workplace/recentActivityController.js', () => ({ aggregateRecentActivity: vi.fn() }));

const { fetchGroups } = await import('./initController.js');

const TOKEN = 'a'.repeat(32);

beforeEach(() => query.mockReset());

function given(role: string, group: Record<string, unknown>) {
  query
    .mockResolvedValueOnce([{ group_id: 'g1', role, joined_at: new Date() }])
    .mockResolvedValueOnce([{ id: 'g1', created_by: 'creator', join_token: TOKEN, ...group }]);
}

describe('fetchGroups', () => {
  it('hides the invite link from plain members', async () => {
    given('member', { is_system: false });
    expect(await fetchGroups('u1')).toMatchObject([{ join_token: null }]);
  });

  it('returns it to admins', async () => {
    given('admin', { is_system: false });
    expect(await fetchGroups('u1')).toMatchObject([{ join_token: TOKEN }]);
  });

  it('never returns a link for the system project, not even to its admins', async () => {
    given('admin', { is_system: true });
    expect(await fetchGroups('u1')).toMatchObject([{ join_token: null }]);
  });
});
