/**
 * Tests for the EU-greens batching in PolitProService.
 *
 * The batch is the part that broke in production (GRUENERATOR-F9): 23 country
 * requests fired at once blew PolitPro's 30 req/min budget, every one came
 * back 429, and the endpoint answered 503. What guards against that is timing-
 * dependent and impossible to eyeball, so it is pinned here:
 *
 *   1. concurrent callers share ONE upstream run (single-flight),
 *   2. a wiped-out batch serves the last-good snapshot instead of null,
 *   3. a heavily incomplete batch never overwrites that snapshot.
 *
 * Fake timers stand in for the pacing pauses between chunks, so the suite runs
 * in milliseconds instead of the ~8s the paced batch takes in production.
 *
 * Run: `npx vitest run services/monitor/PolitProService.vitest.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../config/env.js', () => ({
  env: { POLITPRO_API_KEY: 'test-key' },
}));

const store = new Map<string, unknown>();
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async (key: string) => store.get(key) ?? null),
  setCachedJson: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  deleteCachedKey: vi.fn(async () => undefined),
}));

const { EU_GREEN_PARTIES, getEuGreens } = await import('./PolitProService.js');

const CACHE_KEY = 'monitor:politpro:eu-greens';
const LAST_GOOD_KEY = `${CACHE_KEY}:last-good`;

const SNAPSHOT = {
  results: [
    {
      countryCode: 'de',
      countryName: 'Deutschland',
      party: 'GRÜNE',
      percent: 12.3,
      diff: null,
      electionDiff: null,
      date: '2026-08-01',
      note: null,
    },
  ],
  fetchedAt: '2026-08-01T00:00:00.000Z',
};

/** The country code the service asked for, e.g. `/de/trend` → `de`. */
function countryOf(url: string): string | null {
  return /\/api\/v1\/([a-z0-9-]+)\/trend$/.exec(url)?.[1] ?? null;
}

function trendResponse(code: string): Response {
  const entry = EU_GREEN_PARTIES.find((e) => e.countryCode === code);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        poll: {
          date: '2026-08-10',
          parliament: code,
          seats_total: 100,
          parties: [
            { name_short: entry?.partyShort ?? '?', name_long: 'x', percent: 10, diff: 0.5 },
          ],
        },
      },
    }),
  } as unknown as Response;
}

const rateLimited = { ok: false, status: 429 } as unknown as Response;

const fetchMock = vi.fn();

beforeEach(() => {
  store.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Drive the paced batch past its inter-chunk sleeps. */
async function runPaced<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return pending;
}

describe('getEuGreens — single-flight', () => {
  it('collapses concurrent cold-cache calls into one upstream batch', async () => {
    fetchMock.mockImplementation((url: string) => {
      const code = countryOf(url);
      return Promise.resolve(code ? trendResponse(code) : rateLimited);
    });

    const first = getEuGreens();
    const second = getEuGreens();
    const [a, b] = await runPaced(Promise.all([first, second]));

    expect(fetchMock).toHaveBeenCalledTimes(EU_GREEN_PARTIES.length);
    expect(a).toBe(b);
    expect(a?.results).toHaveLength(EU_GREEN_PARTIES.length);
  });

  it('writes both the regular cache and the last-good snapshot on a full batch', async () => {
    fetchMock.mockImplementation((url: string) => {
      const code = countryOf(url);
      return Promise.resolve(code ? trendResponse(code) : rateLimited);
    });

    await runPaced(getEuGreens());

    expect(store.get(CACHE_KEY)).toBeDefined();
    expect(store.get(LAST_GOOD_KEY)).toEqual(store.get(CACHE_KEY));
  });
});

describe('getEuGreens — last-good fallback', () => {
  it('serves the snapshot when the whole batch is rate-limited', async () => {
    store.set(LAST_GOOD_KEY, SNAPSHOT);
    fetchMock.mockResolvedValue(rateLimited);

    const data = await runPaced(getEuGreens());

    expect(data).toEqual(SNAPSHOT);
    // A wiped-out batch must not poison the regular cache with an empty result.
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('returns null when everything fails and no snapshot exists', async () => {
    fetchMock.mockResolvedValue(rateLimited);

    await expect(runPaced(getEuGreens())).resolves.toBeNull();
  });

  it('prefers the snapshot over a heavily incomplete batch', async () => {
    store.set(LAST_GOOD_KEY, SNAPSHOT);
    const surviving = EU_GREEN_PARTIES.slice(0, 3).map((e) => e.countryCode);
    fetchMock.mockImplementation((url: string) => {
      const code = countryOf(url);
      return Promise.resolve(code && surviving.includes(code) ? trendResponse(code) : rateLimited);
    });

    const data = await runPaced(getEuGreens());

    expect(data).toEqual(SNAPSHOT);
    expect(store.has(CACHE_KEY)).toBe(false);
    expect(store.get(LAST_GOOD_KEY)).toEqual(SNAPSHOT);
  });
});
