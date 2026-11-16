import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({ groupBy: () => ({ orderBy: async () => rows.value }) }),
      }),
    }),
  }),
}));

const { listAllConventions } = await import('./parteitageViews.js');

const convention = (hash: string | null) => ({
  id: 'c1',
  key: 'k',
  slug_name: 'LDK Essen',
  slug_suffix: 'abc123',
  title: 'LDK',
  short_title: 'LDK',
  organizer: 'NRW',
  audience: 'all',
  starts_on: '2026-01-01',
  ends_on: '2026-01-02',
  location: 'Essen',
  status: 'published',
  access_password_hash: hash,
});

describe('listAllConventions', () => {
  it('reports hasPassword from the stored hash', async () => {
    rows.value = [
      { convention: convention('salt:hash'), speechCount: 2 },
      { convention: convention(null), speechCount: 0 },
    ];
    const list = await listAllConventions();
    expect(list.map((c) => c.hasPassword)).toEqual([true, false]);
  });
});
