import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/content` is the migration target for the workplace "Zuletzt" strip, so its image
 * query has to hide source uploads the same way `getUserShares` does — a divergence here
 * would only show up on the day that migration lands. The twin assertions live in
 * `services/sharedMediaService.vitest.ts`.
 */
const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();

// Spread the real module: `PostgresService/index.ts` re-exports the class, so replacing
// the whole module wholesale breaks that barrel for everything else in the import graph.
vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPostgresInstance: () => ({ query }),
}));

const { fetchImages, fetchVideos } = await import('./contentQueries.js');

const ORIGIN_CLAUSE = /content_origin\s+IS\s+NULL\s+OR\s+content_origin\s*!=\s*ALL/i;

function lastCall(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.at(-1);
  if (!call) throw new Error('no query was issued');
  return { sql: call[0], params: call[1] };
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe('fetchImages', () => {
  it('excludes source uploads', async () => {
    await fetchImages('user-1', 20, null);

    const { sql, params } = lastCall();
    expect(sql).toMatch(ORIGIN_CLAUSE);
    expect(params).toContainEqual(['upload']);
  });

  it("keeps 'unknown' visible", async () => {
    await fetchImages('user-1', 20, null);

    const excluded = lastCall().params.find(
      (p): p is string[] => Array.isArray(p) && p.includes('upload')
    );
    expect(excluded).toEqual(['upload']);
  });

  /**
   * The cursor branch appends its own placeholders off `params.length`, so inserting the
   * origin parameter ahead of it is exactly the kind of change that silently shifts a
   * later `$n`. Paginated and unpaginated both have to stay consistent.
   */
  it.each([
    ['without a cursor', null],
    [
      'with a cursor',
      {
        kind: 'image' as const,
        date: '2026-08-01T12:00:00.000Z',
        id: 'img-1',
        kinds: ['image' as const],
      },
    ],
  ])('numbers its placeholders consecutively %s', async (_label, cursor) => {
    await fetchImages('user-1', 20, cursor);

    const { sql, params } = lastCall();
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(used)).toEqual(new Set(params.map((_, i) => i + 1)));
  });
});

/**
 * A trashed image or Reel keeps its row until the purge, so the content feed has
 * to leave it out itself — with and without a cursor, since the cursor branch
 * rebuilds the WHERE.
 */
describe('Papierkorb', () => {
  it.each([
    ['images', () => fetchImages('user-1', 20, null)],
    [
      'images with a cursor',
      () =>
        fetchImages('user-1', 20, {
          kind: 'image',
          date: '2026-08-01T12:00:00.000Z',
          id: 'i',
          kinds: ['image'],
        }),
    ],
    ['Reels', () => fetchVideos('user-1', 20, null)],
    [
      'Reels with a cursor',
      () =>
        fetchVideos('user-1', 20, {
          kind: 'video',
          date: '2026-08-01T12:00:00.000Z',
          id: 'v',
          kinds: ['video'],
        }),
    ],
  ])('hides trashed %s', async (_label, fetch) => {
    await fetch();
    expect(lastCall().sql).toMatch(/WHERE deleted_at IS NULL AND/);
  });
});
