import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));
vi.mock('../sharepicVorlagen/catalog.js', () => ({ getSharepicVorlage: vi.fn() }));

const { templateExistsFor } = await import('./templateTarget.js');

type Deps = NonNullable<Parameters<typeof templateExistsFor>[2]>;

const ID = '11111111-2222-4333-8444-555555555555';

function fakeDeps(row: Record<string, unknown> | null, catalogue: unknown = null) {
  const queryOne = vi.fn(async () => row);
  const getSharepicVorlage = vi.fn(() => catalogue);
  const deps = { postgres: { queryOne }, getSharepicVorlage } as unknown as Deps;
  return { deps, queryOne, getSharepicVorlage };
}

describe('templateExistsFor', () => {
  it('finds a visible user template by UUID, scoped to the viewer', async () => {
    const { deps, queryOne, getSharepicVorlage } = fakeDeps({ ok: 1 });
    expect(await templateExistsFor('viewer', ID, deps)).toBe(true);
    const [sql, params] = queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain("is_private = false AND status = 'published'");
    expect(sql).toContain('user_id = $2');
    expect(params).toEqual([ID, 'viewer']);
    expect(getSharepicVorlage).not.toHaveBeenCalled();
  });

  it('rejects a UUID without a visible row', async () => {
    const { deps } = fakeDeps(null);
    expect(await templateExistsFor('viewer', ID, deps)).toBe(false);
  });

  it('resolves a non-UUID id against the catalogue', async () => {
    const { deps, queryOne, getSharepicVorlage } = fakeDeps(null, { id: 'alt-dreizeilen' });
    expect(await templateExistsFor('viewer', 'alt-dreizeilen', deps)).toBe(true);
    expect(getSharepicVorlage).toHaveBeenCalledWith('alt-dreizeilen');
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('rejects an unknown catalogue id', async () => {
    const { deps } = fakeDeps(null, null);
    expect(await templateExistsFor('viewer', 'gibt-es-nicht', deps)).toBe(false);
  });
});
