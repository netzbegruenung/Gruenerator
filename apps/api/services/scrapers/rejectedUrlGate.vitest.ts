/**
 * The gate's whole value is that it skips a fetch. That makes both failure
 * modes silent: cache too much and a page that changed never gets re-read;
 * fail to load and the saving quietly disappears while everything stays green.
 * These cases pin the two decisions that keep it honest — which reason may be
 * remembered, and what a broken database does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();

vi.mock('../../database/services/PostgresService/index.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { CACHEABLE_REJECTION_REASON, loadRejectedUrls, rememberRejection } =
  await import('./rejectedUrlGate.js');

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
});

/** The SQL a call produced, for substring assertions. */
function sqlOf(callIndex = 0): string {
  return String(query.mock.calls[callIndex]?.[0] ?? '');
}

function paramsOf(callIndex = 0): unknown[] {
  return (query.mock.calls[callIndex]?.[1] ?? []) as unknown[];
}

describe('loading remembered rejections', () => {
  it('only ever loads the one reason that cannot reverse on its own', async () => {
    await loadRejectedUrls('berlin-lv-beschluesse');

    // A 'too_short' page can be filled in next week. If it were loaded here,
    // the gate would skip it forever and that update would never be seen.
    expect(paramsOf()).toEqual(['berlin-lv-beschluesse', CACHEABLE_REJECTION_REASON]);
    expect(sqlOf()).toContain('reason = $2');
  });

  it('normalises the timestamp the driver returns into an ISO string', async () => {
    query.mockResolvedValue([
      { source_url: 'https://gruene.berlin/a', published_at: new Date('2018-04-01T00:00:00.000Z') },
    ]);

    const map = await loadRejectedUrls('berlin-lv-beschluesse');

    // The caller feeds this straight into `new Date(...)` to re-decide against
    // the current age limit; a raw Date object would work here and a string
    // from a different driver would not, so the gate settles it.
    expect(map.get('https://gruene.berlin/a')).toBe('2018-04-01T00:00:00.000Z');
  });

  it('yields an empty map when the database is unreachable', async () => {
    query.mockRejectedValue(new Error('no postgres in CI'));

    // Fail-open by design: the CLI entry point runs in CI without Postgres,
    // and an empty map is exactly the behaviour before this gate existed —
    // the URL gets fetched. Throwing here would kill the whole sync.
    await expect(loadRejectedUrls('berlin-lv-presse')).resolves.toEqual(new Map());
  });
});

describe('remembering a rejection', () => {
  it('upserts so a re-dated page does not accumulate rows', async () => {
    await rememberRejection({
      url: 'https://gruene.berlin/a',
      sourceId: 'berlin-lv-beschluesse',
      reason: CACHEABLE_REJECTION_REASON,
      publishedAt: '2018-04-01T00:00:00.000Z',
    });

    // The URL is the identity here, not the attempt.
    expect(sqlOf()).toContain('ON CONFLICT (source_url) DO UPDATE');
  });

  it('passes as many placeholders as parameters', async () => {
    await rememberRejection({
      url: 'https://gruene.berlin/a',
      sourceId: 'berlin-lv-beschluesse',
      reason: CACHEABLE_REJECTION_REASON,
      publishedAt: '2018-04-01T00:00:00.000Z',
    });

    const placeholders = new Set(sqlOf().match(/\$\d+/g));
    expect(placeholders.size).toBe(paramsOf().length);
  });

  it('swallows a write failure instead of killing the sync', async () => {
    query.mockRejectedValue(new Error('connection reset'));

    await expect(
      rememberRejection({
        url: 'https://gruene.berlin/a',
        sourceId: 'berlin-lv-beschluesse',
        reason: CACHEABLE_REJECTION_REASON,
        publishedAt: '2018-04-01T00:00:00.000Z',
      })
    ).resolves.toBeUndefined();
  });
});
