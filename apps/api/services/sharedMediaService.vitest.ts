import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two listing queries over `shared_media` answer different questions, and the whole
 * point of this pair of tests is the contrast: creation feeds hide source images, the
 * Mediathek shows them. Asserting only the first would be a tautology — it would still
 * pass if the filter had leaked into `getMediaLibrary` and emptied the Mediathek.
 *
 * The service is exercised against a fake Postgres so the assertions are about the SQL and
 * its parameters, which is where the policy actually lives.
 */
const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
const queryOne = vi.fn<(sql: string, params: unknown[]) => Promise<unknown>>();

vi.mock('../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    query,
    queryOne,
  }),
}));

const { default: SharedMediaService } = await import('./sharedMediaService.js');

/** The `content_origin` predicate, whitespace-insensitive. */
const ORIGIN_CLAUSE = /content_origin\s+IS\s+NULL\s+OR\s+content_origin\s*!=\s*ALL/i;

function lastCall(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.at(-1);
  if (!call) throw new Error('no query was issued');
  return { sql: call[0], params: call[1] };
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  queryOne.mockReset().mockResolvedValue({ total: '0' });
});

describe('getUserShares', () => {
  it('excludes source uploads, so creation feeds only show creations', async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image', ['ready', 'draft'], 30);

    const { sql, params } = lastCall();
    expect(sql).toMatch(ORIGIN_CLAUSE);
    expect(params).toContainEqual(['upload']);
  });

  it("keeps 'unknown' visible — the backfill could not classify those rows", async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image');

    const { sql, params } = lastCall();
    expect(sql).toMatch(ORIGIN_CLAUSE);
    const excluded = params.find((p): p is string[] => Array.isArray(p) && p.includes('upload'));
    expect(excluded).toEqual(['upload']);
    expect(excluded).not.toContain('unknown');
  });

  it('numbers its placeholders consecutively with the origin filter in place', async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image', ['ready'], 5);

    const { sql, params } = lastCall();
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(used)).toEqual(new Set(params.map((_, i) => i + 1)));
  });
});

describe('getMediaLibrary', () => {
  it('does NOT exclude uploads — the Mediathek is where they belong', async () => {
    const service = new SharedMediaService();
    await service.getMediaLibrary('user-1', { type: 'image' });

    expect(lastCall().sql).not.toMatch(ORIGIN_CLAUSE);
  });
});
