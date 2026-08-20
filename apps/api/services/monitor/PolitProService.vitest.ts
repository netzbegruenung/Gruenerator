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

const { EU_GREEN_PARTIES, getEuGreens, getPolitProPolls, getPollsOverview, POLITPRO_PARLIAMENTS } =
  await import('./PolitProService.js');

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

/** A real 429 always carries headers; `fetchApi` reads `Retry-After` off them. */
function rateLimitedWith(retryAfter: string | null = null): Response {
  return {
    ok: false,
    status: 429,
    headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
  } as unknown as Response;
}

const rateLimited = rateLimitedWith();

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

// ── Per-parliament polls ────────────────────────────────────────────────────
//
// The 20.08.2026 incident: 16 Bundesländer mounted at once → 48 upstream calls
// in a second → 429s → the resulting HALF answers were cached as if complete,
// so Bayern showed 4 parties instead of 8 for the next twelve hours.

const BY_CACHE_KEY = 'monitor:politpro:v2:bayern';

/** `/de-by/trend` — the one call that must succeed for a usable answer. */
function trendFor(code: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        poll: {
          date: '2026-08-18',
          parliament: code,
          parties: [
            { name_short: 'Grüne', name_long: 'Grüne', percent: 14.5, diff: 0.3 },
            { name_short: 'CDU/CSU', name_long: 'Union', percent: 38, diff: -0.2 },
          ],
        },
      },
    }),
  } as unknown as Response;
}

function institutesFor(code: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        polls: [
          {
            parliament: code,
            end: '2026-08-15',
            institute: { name: 'Forsa', score: 80 },
            sample_size: 1000,
            parties: [{ name_short: 'Grüne', name_long: 'Grüne', percent: 14 }],
          },
          {
            parliament: code,
            end: '2026-08-08',
            institute: { name: 'INSA', score: 75 },
            sample_size: 1200,
            parties: [{ name_short: 'Grüne', name_long: 'Grüne', percent: 15 }],
          },
        ],
      },
    }),
  } as unknown as Response;
}

function historyFor(code: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        parliament: code,
        datasets: [{ name_short: 'Grüne', history: [{ date: '2026-08-01', percent: 14 }] }],
      },
    }),
  } as unknown as Response;
}

/** Route a PolitPro path to the right fixture; `null` = let the caller decide. */
function pollFixture(url: string): Response | null {
  const m = /\/api\/v1\/([a-z0-9-]+)\/(.*)$/.exec(url);
  if (!m) return null;
  const [, code, rest] = m;
  if (rest === 'trend') return trendFor(code);
  if (rest === 'polls/institutes') return institutesFor(code);
  if (rest.startsWith('trend/history')) return historyFor(code);
  return null;
}

describe('getPolitProPolls — rate limits must not become cached facts', () => {
  it('caches a complete answer for the long TTL and promotes it to last-good', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(pollFixture(url) ?? rateLimited));

    const data = await runPaced(getPolitProPolls('bayern'));

    expect(data?.polls).toHaveLength(2);
    expect(Object.keys(data?.trend ?? {})).toContain('GRÜNE');
    expect(store.get(BY_CACHE_KEY)).toBeDefined();
    expect(store.get(`${BY_CACHE_KEY}:last-good`)).toEqual(store.get(BY_CACHE_KEY));
  });

  it('does NOT promote a partial answer to last-good when history is rate-limited', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/trend/history')) return Promise.resolve(rateLimited);
      return Promise.resolve(pollFixture(url) ?? rateLimited);
    });

    const data = await runPaced(getPolitProPolls('bayern'));

    // Still served — a trend without history beats an empty panel …
    expect(data?.average['GRÜNE']).toBe(14.5);
    expect(data?.trend).toEqual({});
    // … but it must never become the reference copy, and it must expire soon.
    expect(store.has(`${BY_CACHE_KEY}:last-good`)).toBe(false);
    expect(store.get(BY_CACHE_KEY)).toBeDefined();
  });

  it('retries once when Retry-After is short enough to wait out', async () => {
    let institutesCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/polls/institutes')) {
        institutesCalls++;
        if (institutesCalls === 1) return Promise.resolve(rateLimitedWith('2'));
      }
      return Promise.resolve(pollFixture(url) ?? rateLimited);
    });

    const data = await runPaced(getPolitProPolls('bayern'));

    expect(institutesCalls).toBe(2);
    // The retry succeeded, so this counts as a complete answer.
    expect(data?.polls).toHaveLength(2);
    expect(store.get(`${BY_CACHE_KEY}:last-good`)).toBeDefined();
  });

  it('gives up instead of parking the request when Retry-After is long', async () => {
    let institutesCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/polls/institutes')) {
        institutesCalls++;
        return Promise.resolve(rateLimitedWith('120'));
      }
      return Promise.resolve(pollFixture(url) ?? rateLimited);
    });

    const data = await runPaced(getPolitProPolls('bayern'));

    expect(institutesCalls).toBe(1);
    expect(data).not.toBeNull();
    expect(store.has(`${BY_CACHE_KEY}:last-good`)).toBe(false);
  });

  it('falls back to last-good when even the trend call fails', async () => {
    const previous = {
      polls: [{ institute: 'Forsa', date: '2026-08-01', parties: { GRÜNE: 13 } }],
      lastElection: null,
      average: { GRÜNE: 13 },
      diffs: {},
      scrapedAt: '2026-08-01T00:00:00.000Z',
      source: 'politpro' as const,
      parliament: 'bayern',
      trend: {},
    };
    store.set(`${BY_CACHE_KEY}:last-good`, previous);
    fetchMock.mockResolvedValue(rateLimited);

    await expect(runPaced(getPolitProPolls('bayern'))).resolves.toEqual(previous);
  });

  it('collapses concurrent cold-cache calls for the same parliament', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(pollFixture(url) ?? rateLimited));

    const [a, b] = await runPaced(
      Promise.all([getPolitProPolls('bayern'), getPolitProPolls('bayern')])
    );

    // 3 upstream calls for one parliament, not 6.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(a).toBe(b);
  });
});

describe('getPollsOverview', () => {
  it('answers every DE parliament from one paced pass', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(pollFixture(url) ?? rateLimited));

    const overview = await runPaced(getPollsOverview('DE'));

    // 16 Länder + Bundestag.
    expect(overview.entries).toHaveLength(17);
    const bayern = overview.entries.find((e) => e.parliament === 'bayern');
    expect(bayern?.gruene).toBe(14.5);
    // Two institute polls → the date is real and may be shown.
    expect(bayern?.latestPollDate).toBe('2026-08-15');
  });

  // Pacing exists for the 30 req/min budget, and that budget counts NETWORK
  // calls. A warm run makes none, so it must not sit out 3 × 4 s — this is a
  // request-path endpoint. Deliberately NOT wrapped in `runPaced`: under fake
  // timers an unnecessary sleep would never resolve, so this test would hang
  // rather than pass quietly.
  it('returns without any pacing pause when every parliament is cached', async () => {
    const parliaments = POLITPRO_PARLIAMENTS.filter((p) => p.country === 'DE');
    for (const p of parliaments) {
      store.set(`monitor:politpro:v2:${p.id}`, {
        polls: [
          { institute: 'Forsa', date: '2026-08-15', parties: { GRÜNE: 14.5 } },
          { institute: 'INSA', date: '2026-08-08', parties: { GRÜNE: 15 } },
        ],
        lastElection: null,
        average: { GRÜNE: 14.5 },
        diffs: {},
        scrapedAt: '2026-08-20T00:00:00.000Z',
        source: 'politpro',
        parliament: p.id,
        trend: {},
      });
    }
    fetchMock.mockImplementation(() => {
      throw new Error('no upstream call expected on a warm cache');
    });

    const overview = await getPollsOverview('DE');

    expect(overview.entries).toHaveLength(parliaments.length);
    expect(fetchMock).not.toHaveBeenCalled();
    // Nothing left waiting on the clock.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hides the date when only the synthetic weighted trend came back', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/polls/institutes')) return Promise.resolve(rateLimited);
      return Promise.resolve(pollFixture(url) ?? rateLimited);
    });

    const overview = await runPaced(getPollsOverview('DE'));
    const bayern = overview.entries.find((e) => e.parliament === 'bayern');

    expect(bayern?.gruene).toBe(14.5);
    expect(bayern?.latestPollDate).toBeNull();
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
