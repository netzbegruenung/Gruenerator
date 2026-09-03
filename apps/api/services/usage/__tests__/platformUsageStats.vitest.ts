/**
 * The rules that decide what a PUBLIC endpoint is allowed to say.
 *
 * Two of them are load-bearing and neither is visible from reading a response:
 * that a thin day is removed from the totals rather than merely hidden from the
 * chart, and that a window nobody used publishes nothing at all. Both fail
 * silently — the endpoint keeps answering, just with numbers it should not have
 * — so they are pinned here.
 *
 * Drizzle is faked at the query level. The three statements run in a fixed
 * order (day census → distinct users → aggregate), which is what the queue
 * below encodes.
 */

import { getTransparencyStatsResponseSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Results handed to consecutive select() calls, in order. */
let selectQueue: unknown[][] = [];

function builder(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'groupBy', 'orderBy', 'limit']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const getDrizzleInstance = vi.fn(() => ({
  select: () => builder(selectQueue.shift() ?? []),
}));

vi.mock('../../../database/services/DrizzleService.js', () => ({ getDrizzleInstance }));

const { computePlatformUsageStats, MIN_GROUP_SIZE } = await import('../platformUsageStats.js');

/** One aggregate row, with the zero-heavy fields defaulted away. */
function row(over: Partial<Record<string, string | number>> = {}) {
  return {
    day: '2026-07-30',
    feature: 'chat',
    provider: 'greenpt',
    model: 'gemma4-31b',
    unit: 'tokens',
    requests: 10,
    inputTokens: 5000,
    outputTokens: 1000,
    ops: 0,
    energyWms: 0,
    emissionsUg: 0,
    ...over,
  };
}

beforeEach(() => {
  selectQueue = [];
});

describe('cell suppression', () => {
  it('removes a thin day from the TOTALS, not just from the daily series', async () => {
    selectQueue = [
      // day census: one day clears the threshold, one does not
      [
        { day: '2026-07-30', activeUsers: MIN_GROUP_SIZE },
        { day: '2026-07-31', activeUsers: MIN_GROUP_SIZE - 1 },
      ],
      [{ activeUsers: MIN_GROUP_SIZE }],
      // the aggregate is asked only for eligible days, so only that day's rows
      // come back — mirroring the `day = any(...)` filter
      [row({ day: '2026-07-30', outputTokens: 1000 })],
    ];

    const stats = await computePlatformUsageStats(30);

    expect(stats.suppressed_days).toBe(1);
    expect(stats.daily.map((d) => d.day)).toEqual(['2026-07-30']);
    // The point of the test: the withheld day is absent from the headline too.
    // If suppression only hid the row, two windows one day apart could be
    // subtracted to recover it.
    expect(stats.totals.output_tokens).toBe(1000);
  });

  it('publishes nothing when the whole window is below the threshold', async () => {
    selectQueue = [[{ day: '2026-07-31', activeUsers: MIN_GROUP_SIZE - 1 }]];

    const stats = await computePlatformUsageStats(30);

    expect(stats.sufficient_data).toBe(false);
    expect(stats.suppressed_days).toBe(1);
    expect(stats.totals.total_tokens).toBe(0);
    expect(stats.footprint.emissions_g).toBe(0);
    expect(stats.daily).toEqual([]);
  });

  it('withholds the window when enough days qualify but too few PEOPLE do', async () => {
    // Every day clears the bar on its own, yet it is the same handful of users
    // returning — the per-day census cannot see that, the distinct count can.
    selectQueue = [
      [
        { day: '2026-07-30', activeUsers: MIN_GROUP_SIZE },
        { day: '2026-07-31', activeUsers: MIN_GROUP_SIZE },
      ],
      [{ activeUsers: MIN_GROUP_SIZE - 1 }],
    ];

    const stats = await computePlatformUsageStats(30);

    expect(stats.sufficient_data).toBe(false);
    expect(stats.suppressed_days).toBe(2);
  });

  it('reports the threshold it applied', async () => {
    selectQueue = [[]];
    const stats = await computePlatformUsageStats(30);
    expect(stats.min_group_size).toBe(MIN_GROUP_SIZE);
  });
});

describe('footprint band', () => {
  const eligible = () => [
    [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
    [{ activeUsers: MIN_GROUP_SIZE }],
  ];

  it('collapses to a single value where the provider measured it', async () => {
    selectQueue = [...eligible(), [row({ energyWms: 3_600_000, emissionsUg: 1_000_000 })]];

    const stats = await computePlatformUsageStats(30);

    expect(stats.footprint.energy_wh).toBeCloseTo(1, 6);
    expect(stats.footprint.energy_wh_low).toBeCloseTo(stats.footprint.energy_wh, 6);
    expect(stats.footprint.measured_share).toBeCloseTo(1, 6);
  });

  it('opens up where a lane is valued by bound rather than by meter', async () => {
    // qwen3.5-122b has no meter; it is costed at the top of the measured span.
    selectQueue = [...eligible(), [row({ provider: 'regolo', model: 'pixtral-large-latest' })]];

    const stats = await computePlatformUsageStats(30);

    expect(stats.footprint.bounded_share).toBeCloseTo(1, 6);
    expect(stats.footprint.energy_wh_low).toBeLessThan(stats.footprint.energy_wh);
    expect(stats.footprint.energy_wh_low).toBeGreaterThan(0);
  });

  it('brackets a generated image between the bare meter and the corrected one', async () => {
    selectQueue = [
      ...eligible(),
      [row({ provider: 'bfl', model: 'flux-2-pro', unit: 'images', ops: 1, requests: 0 })],
    ];

    const stats = await computePlatformUsageStats(30);

    // Only the boundary uplift moves for an image, so the scale's ends stand in
    // its ratio (1.92 .. 2.70) and the published figure is the middle.
    const { energy_wh, energy_wh_low, energy_wh_high, image_energy_wh } = stats.footprint;
    expect(energy_wh_high / energy_wh_low).toBeCloseTo(2.7 / 1.92, 6);
    expect(energy_wh).toBeCloseTo(Math.sqrt(energy_wh_low * energy_wh_high), 6);
    expect(energy_wh_low).toBeLessThan(energy_wh);
    expect(energy_wh).toBeLessThan(energy_wh_high);
    // The headline is the middle, and the image half of it is the whole of it.
    expect(image_energy_wh).toBeCloseTo(energy_wh, 6);
  });
});

describe('what the number does not include', () => {
  it('surfaces transcriptions and searches as counted-but-unvalued', async () => {
    selectQueue = [
      [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
      [{ activeUsers: MIN_GROUP_SIZE }],
      [
        row({ provider: 'linkup', model: 'standard', unit: 'searches', ops: 7, requests: 0 }),
        row({
          provider: 'greenpt',
          model: 'green-s-pro',
          unit: 'transcriptions',
          ops: 3,
          requests: 0,
        }),
      ],
    ];

    const stats = await computePlatformUsageStats(30);

    expect(stats.footprint.unvalued_ops).toEqual({
      transcriptions: 3,
      searches: 7,
      speech_seconds: 0,
    });
    expect(stats.footprint.energy_wh).toBe(0);
    // A provider at 0 g in the list would read as "this one is free". The two
    // units have no coefficient at all, which is a different statement.
    expect(stats.providers).toEqual([]);
  });
});

describe('provider disclosure', () => {
  it('ships the constants each figure was computed with', async () => {
    selectQueue = [
      [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
      [{ activeUsers: MIN_GROUP_SIZE }],
      [row({ provider: 'regolo', model: 'pixtral-large-latest' })],
    ];

    const stats = await computePlatformUsageStats(30);

    expect(stats.providers).toHaveLength(1);
    const [regolo] = stats.providers;
    expect(regolo?.provider).toBe('regolo');
    expect(regolo?.grid_g_per_kwh).toBe(270); // Italy 2024, Ember
    expect(regolo?.pue).toBeCloseTo(1.2, 6); // Seeweb, DHH report 2024
    expect(regolo?.emissions_g).toBeGreaterThan(0);
  });
});

describe('cacheability', () => {
  /**
   * The cache validates against the response schema on every read, and Zod
   * rejects NaN. A single division by zero slipping through would therefore not
   * throw — it would make every read a miss, and the public endpoint would
   * quietly recompute three aggregate scans per request forever. Cheap to pin,
   * invisible in production.
   */
  it.each([
    ['an empty window', []],
    ['a window with activity but no priceable model', [row({ model: 'model-nobody-registered' })]],
    [
      'a mix of measured, bound and unvalued rows',
      [
        row({ energyWms: 1_000_000, emissionsUg: 5_000 }),
        row({ provider: 'regolo', model: 'pixtral-large-latest' }),
        row({ provider: 'linkup', model: 'deep', unit: 'searches', ops: 2, requests: 0 }),
      ],
    ],
  ])('survives a schema round-trip for %s', async (_label, aggregateRows) => {
    selectQueue = [
      [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
      [{ activeUsers: MIN_GROUP_SIZE }],
      aggregateRows,
    ];

    const stats = await computePlatformUsageStats(30);
    const parsed = getTransparencyStatsResponseSchema.safeParse(stats);

    expect(parsed.success ? null : parsed.error.message).toBeNull();
  });
});
