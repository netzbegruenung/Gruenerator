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
/** The condition each statement was given, in the same order. */
let whereArgs: unknown[] = [];

/**
 * The area-split census (day × area people, then the thin cells per day, then
 * the window remainder) runs on its own queue, recognisable by its `users`
 * column, so the publishing statements above keep their fixed order.
 *
 * `cellCensus` null means: every day × area in the queued aggregate has exactly
 * MIN_GROUP_SIZE people, i.e. the split is unremarkable.
 */
let cellCensus: { day: string; feature: string; users: number }[] | null = null;
let areaQueue: unknown[][] = [];
let areaWhereArgs: unknown[] = [];

function builder(result: unknown, sink: () => unknown[] = () => whereArgs) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'groupBy', 'orderBy', 'limit']) {
    chain[method] = () => chain;
  }
  chain.where = (condition: unknown) => {
    sink().push(condition);
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function censusFromAggregate() {
  const aggregate = (selectQueue[selectQueue.length - 1] ?? []) as {
    day: string;
    feature: string;
  }[];
  const seen = new Map<string, { day: string; feature: string; users: number }>();
  for (const r of aggregate) {
    seen.set(`${r.day}|${r.feature}`, { day: r.day, feature: r.feature, users: MIN_GROUP_SIZE });
  }
  return [...seen.values()];
}

const getDrizzleInstance = vi.fn(() => ({
  select: (fields: Record<string, unknown> = {}) => {
    if ('users' in fields) {
      const result =
        'feature' in fields ? (cellCensus ?? censusFromAggregate()) : (areaQueue.shift() ?? []);
      return builder(result, () => areaWhereArgs);
    }
    return builder(selectQueue.shift() ?? []);
  },
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
    measuredRequests: 0,
    measuredInputTokens: 0,
    measuredOutputTokens: 0,
    ...over,
  };
}

/** A row whose every call reported its footprint. */
function measured(over: Partial<Record<string, string | number>> = {}) {
  const base = row(over);
  return {
    ...base,
    measuredRequests: base.requests,
    measuredInputTokens: base.inputTokens,
    measuredOutputTokens: base.outputTokens,
  };
}

beforeEach(() => {
  selectQueue = [];
  whereArgs = [];
  cellCensus = null;
  areaQueue = [];
  areaWhereArgs = [];
});

/**
 * Every bound parameter value inside a drizzle SQL tree, in order. A primitive
 * interpolated into a `sql` template sits in `queryChunks` as itself and only
 * becomes a `Param` when the query is built, so both forms are collected.
 */
function boundValues(node: unknown, out: unknown[] = []): unknown[] {
  if (typeof node === 'string' || typeof node === 'number') out.push(node);
  if (node && typeof node === 'object') {
    if ('value' in node && !('queryChunks' in node)) out.push((node as { value: unknown }).value);
    if ('queryChunks' in node) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) boundValues(chunk, out);
    }
    if (Array.isArray(node)) for (const chunk of node) boundValues(chunk, out);
  }
  return out;
}

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

    const stats = await computePlatformUsageStats(30, null);

    expect(stats.suppressed_days).toBe(1);
    expect(stats.daily.map((d) => d.day)).toEqual(['2026-07-30']);
    // The point of the test: the withheld day is absent from the headline too.
    // If suppression only hid the row, two windows one day apart could be
    // subtracted to recover it.
    expect(stats.totals.output_tokens).toBe(1000);
  });

  it('publishes nothing when the whole window is below the threshold', async () => {
    selectQueue = [[{ day: '2026-07-31', activeUsers: MIN_GROUP_SIZE - 1 }]];

    const stats = await computePlatformUsageStats(30, null);

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

    const stats = await computePlatformUsageStats(30, null);

    expect(stats.sufficient_data).toBe(false);
    expect(stats.suppressed_days).toBe(2);
  });

  it('reports the threshold it applied', async () => {
    selectQueue = [[]];
    const stats = await computePlatformUsageStats(30, null);
    expect(stats.min_group_size).toBe(MIN_GROUP_SIZE);
  });
});

describe('locale scope', () => {
  const window = () => [
    [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
    [{ activeUsers: MIN_GROUP_SIZE }],
    [row()],
  ];

  it('narrows EVERY statement to the segment, the census included', async () => {
    // The threshold has to be applied to the segment: if only the aggregate
    // were filtered, a country with two users would pass the platform-wide
    // census and publish a figure about those two.
    selectQueue = window();
    await computePlatformUsageStats(30, 'at');

    expect(whereArgs).toHaveLength(3);
    for (const condition of whereArgs) {
      expect(boundValues(condition)).toContain('de-AT');
    }
  });

  it('binds no country when the whole instance is asked for', async () => {
    selectQueue = window();
    await computePlatformUsageStats(30, null);

    expect(whereArgs).toHaveLength(3);
    for (const condition of whereArgs) {
      const values = boundValues(condition);
      expect(values).not.toContain('de-AT');
      expect(values).not.toContain('de-DE');
    }
  });
});

describe('feature scope', () => {
  const window = () => [
    [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
    [{ activeUsers: MIN_GROUP_SIZE }],
    [row({ feature: 'monitor' })],
  ];

  it('narrows the published statements to the area, but not the census', async () => {
    // The census decides which cells exist; it has to see every area, or the
    // rule would depend on which area was asked for.
    selectQueue = window();
    await computePlatformUsageStats(30, null, 'monitor');

    expect(whereArgs).toHaveLength(3);
    expect(boundValues(whereArgs[0])).not.toContain('monitor');
    expect(boundValues(whereArgs[1])).toContain('monitor');
    expect(boundValues(whereArgs[2])).toContain('monitor');
    for (const condition of areaWhereArgs) {
      expect(boundValues(condition)).not.toContain('monitor');
    }
  });

  it('combines area and country in one scope', async () => {
    selectQueue = window();
    await computePlatformUsageStats(30, 'at', 'monitor');

    for (const condition of [...whereArgs, ...areaWhereArgs]) {
      expect(boundValues(condition)).toContain('de-AT');
    }
    expect(boundValues(whereArgs[2])).toContain('monitor');
  });
});

describe('area split — secondary suppression', () => {
  const days = () => [
    { day: '2026-07-30', activeUsers: 20 },
    { day: '2026-07-31', activeUsers: 20 },
  ];

  it('drops a day from an area when the hidden areas that day are too few', async () => {
    // 07-31: voice has 2 people. Chat − (published areas) would recover them,
    // so on that day NO area may show — monitor included.
    cellCensus = [
      { day: '2026-07-30', feature: 'monitor', users: 6 },
      { day: '2026-07-30', feature: 'chat', users: 15 },
      { day: '2026-07-31', feature: 'monitor', users: 6 },
      { day: '2026-07-31', feature: 'chat', users: 15 },
      { day: '2026-07-31', feature: 'voice', users: 2 },
    ];
    // thin cells per day → 2 people on 07-31; window remainder → 20 people.
    areaQueue = [[{ day: '2026-07-31', users: 2 }], [{ users: 20 }]];
    selectQueue = [days(), [{ activeUsers: 6 }], [row({ feature: 'monitor' })]];

    const stats = await computePlatformUsageStats(30, null, 'monitor');

    expect(stats.sufficient_data).toBe(true);
    expect(stats.suppressed_days).toBe(1);
    // Only 07-30 reaches the published statements.
    expect(boundValues(whereArgs[1])).toContain('2026-07-30');
    expect(boundValues(whereArgs[1])).not.toContain('2026-07-31');
  });

  it('keeps a day when the hidden areas together reach the threshold', async () => {
    cellCensus = [
      { day: '2026-07-30', feature: 'monitor', users: 6 },
      { day: '2026-07-30', feature: 'voice', users: 3 },
      { day: '2026-07-30', feature: 'sites', users: 3 },
    ];
    areaQueue = [[{ day: '2026-07-30', users: 6 }], [{ users: 6 }]];
    selectQueue = [[days()[0]], [{ activeUsers: 6 }], [row({ feature: 'monitor' })]];

    const stats = await computePlatformUsageStats(30, null, 'monitor');
    expect(stats.sufficient_data).toBe(true);
    expect(stats.suppressed_days).toBe(0);
  });

  it('folds unpublishable cells into „Sonstiges" in the unfiltered breakdown', async () => {
    // Otherwise the unfiltered monitor row minus the filtered monitor view
    // would be monitor on its thin day.
    cellCensus = [
      { day: '2026-07-30', feature: 'monitor', users: 6 },
      { day: '2026-07-30', feature: 'chat', users: 15 },
      { day: '2026-07-31', feature: 'monitor', users: 3 },
      { day: '2026-07-31', feature: 'chat', users: 15 },
    ];
    areaQueue = [[{ day: '2026-07-31', users: 3 }], [{ users: 18 }]];
    selectQueue = [
      days(),
      [{ activeUsers: 20 }],
      [
        row({ day: '2026-07-30', feature: 'monitor', outputTokens: 100 }),
        row({ day: '2026-07-31', feature: 'monitor', outputTokens: 7 }),
        row({ day: '2026-07-30', feature: 'chat', outputTokens: 1000 }),
        row({ day: '2026-07-31', feature: 'chat', outputTokens: 1000 }),
      ],
    ];

    const stats = await computePlatformUsageStats(30, null);
    const out = (f: string) => stats.byFeature.find((e) => e.feature === f)?.output_tokens;
    expect(out('monitor')).toBe(100);
    // 07-31 had a hidden cell with too few people → the whole day folds.
    expect(out('chat')).toBe(1000);
    expect(out('other')).toBe(1007);
  });

  it('publishes no area split when the window remainder is too thin', async () => {
    cellCensus = [
      { day: '2026-07-30', feature: 'chat', users: 15 },
      { day: '2026-07-30', feature: 'voice', users: 2 },
    ];
    // The thin cells alone: 2 people on the day, 2 over the window.
    areaQueue = [[{ day: '2026-07-30', users: 2 }], [{ users: 2 }]];
    selectQueue = [[days()[0]], [{ activeUsers: 17 }], [row()]];

    const all = await computePlatformUsageStats(30, null);
    expect(all.sufficient_data).toBe(true);
    expect(all.byFeature).toEqual([]);

    areaQueue = [[{ day: '2026-07-30', users: 2 }], [{ users: 2 }]];
    selectQueue = [[days()[0]]];
    const chat = await computePlatformUsageStats(30, null, 'chat');
    expect(chat.sufficient_data).toBe(false);
  });
});

describe('token split', () => {
  it('splits every breakdown into sent and generated tokens', async () => {
    selectQueue = [
      [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
      [{ activeUsers: MIN_GROUP_SIZE }],
      [
        row(),
        row({ model: 'mistral-medium', provider: 'mistral', inputTokens: 300, outputTokens: 70 }),
      ],
    ];
    const stats = await computePlatformUsageStats(30, null);

    expect(getTransparencyStatsResponseSchema.safeParse(stats).success).toBe(true);
    expect(stats.byFeature).toEqual([
      expect.objectContaining({
        feature: 'chat',
        input_tokens: 5300,
        output_tokens: 1070,
        total_tokens: 6370,
      }),
    ]);
    expect(stats.byModel.find((m) => m.model === 'mistral-medium')).toMatchObject({
      input_tokens: 300,
      output_tokens: 70,
    });
  });
});

describe('footprint band', () => {
  const eligible = () => [
    [{ day: '2026-07-30', activeUsers: MIN_GROUP_SIZE }],
    [{ activeUsers: MIN_GROUP_SIZE }],
  ];

  it('collapses to a single value where the provider measured it', async () => {
    selectQueue = [...eligible(), [measured({ energyWms: 3_600_000, emissionsUg: 1_000_000 })]];

    const stats = await computePlatformUsageStats(30, null);

    expect(stats.footprint.energy_wh).toBeCloseTo(1, 6);
    expect(stats.footprint.energy_wh_low).toBeCloseTo(stats.footprint.energy_wh, 6);
    expect(stats.footprint.measured_share).toBeCloseTo(1, 6);
  });

  it('estimates the calls a partly measured row carries without a measurement', async () => {
    // #3544: a streamed Melious call reports no impact but shares its row with a
    // non-streamed one that did. Its tokens must be estimated, not booked at zero.
    const unmeasuredPart = { requests: 4, inputTokens: 2000, outputTokens: 400 };
    selectQueue = [...eligible(), [row(unmeasuredPart)]];
    const estimateOnly = (await computePlatformUsageStats(30, null)).footprint.energy_wh;

    selectQueue = [
      ...eligible(),
      [
        row({
          energyWms: 3_600_000,
          emissionsUg: 1_000_000,
          measuredRequests: 6,
          measuredInputTokens: 3000,
          measuredOutputTokens: 600,
        }),
      ],
    ];
    const { footprint } = await computePlatformUsageStats(30, null);

    expect(estimateOnly).toBeGreaterThan(0);
    expect(footprint.energy_wh).toBeCloseTo(1 + estimateOnly, 6);
    expect(footprint.measured_share).toBeCloseTo(1 / (1 + estimateOnly), 6);
    expect(footprint.calibrated_share).toBeCloseTo(estimateOnly / (1 + estimateOnly), 6);
  });

  it('never estimates a negative remainder where the meter saw more than was booked', async () => {
    // Rerank books no tokens of its own, only the measured impact.
    selectQueue = [
      ...eligible(),
      [
        row({
          model: 'green-rerank',
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          energyWms: 3_600_000,
          emissionsUg: 1_000_000,
          measuredRequests: 1,
          measuredInputTokens: 800,
        }),
      ],
    ];

    const { footprint } = await computePlatformUsageStats(30, null);

    expect(footprint.energy_wh).toBeCloseTo(1, 6);
    expect(footprint.measured_share).toBeCloseTo(1, 6);
  });

  it('opens up where a lane is valued by bound rather than by meter', async () => {
    // qwen3.5-122b has no meter; it is costed at the top of the measured span.
    selectQueue = [...eligible(), [row({ provider: 'regolo', model: 'pixtral-large-latest' })]];

    const stats = await computePlatformUsageStats(30, null);

    expect(stats.footprint.bounded_share).toBeCloseTo(1, 6);
    expect(stats.footprint.energy_wh_low).toBeLessThan(stats.footprint.energy_wh);
    expect(stats.footprint.energy_wh_low).toBeGreaterThan(0);
  });

  it('names extrapolation from our OWN measurement as its own share', async () => {
    // gemma4-31b carries a metered coefficient but the provider reports nothing
    // per request: neither `measured` (no meter on the row) nor `bounded` (the
    // model itself was measured). Before this share existed it was the largest
    // class on the page and had no label at all.
    selectQueue = [...eligible(), [row()]];

    const stats = await computePlatformUsageStats(30, null);

    expect(stats.footprint.calibrated_share).toBeCloseTo(1, 6);
    expect(stats.footprint.measured_share).toBeCloseTo(0, 6);
    expect(stats.footprint.bounded_share).toBeCloseTo(0, 6);
  });

  it('accounts for every counted watt-hour across the three shares', async () => {
    // The invariant the page rests on. A fourth way into `energy_wh` that no
    // share claims would leave the meters reading well under 100 % with nothing
    // saying why — which is the bug this guards against, not a rounding check.
    selectQueue = [
      ...eligible(),
      [
        measured({ energyWms: 3_600_000, emissionsUg: 1_000_000 }),
        row({ model: 'pixtral-large-latest', provider: 'regolo' }),
        row({ model: 'mistral-small-3.2-24b-instruct-2506', provider: 'mistral' }),
        row({ provider: 'bfl', model: 'flux-2-pro', unit: 'images', ops: 1, requests: 0 }),
      ],
    ];

    const { footprint } = await computePlatformUsageStats(30, null);

    expect(footprint.energy_wh).toBeGreaterThan(0);
    expect(footprint.measured_share).toBeGreaterThan(0);
    expect(footprint.calibrated_share).toBeGreaterThan(0);
    expect(footprint.bounded_share).toBeGreaterThan(0);
    expect(
      footprint.measured_share + footprint.calibrated_share + footprint.bounded_share
    ).toBeCloseTo(1, 6);
  });

  it('brackets a generated image between the bare meter and the corrected one', async () => {
    selectQueue = [
      ...eligible(),
      [row({ provider: 'bfl', model: 'flux-2-pro', unit: 'images', ops: 1, requests: 0 })],
    ];

    const stats = await computePlatformUsageStats(30, null);

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

    const stats = await computePlatformUsageStats(30, null);

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

    const stats = await computePlatformUsageStats(30, null);

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
        measured({ energyWms: 1_000_000, emissionsUg: 5_000 }),
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

    const stats = await computePlatformUsageStats(30, null);
    const parsed = getTransparencyStatsResponseSchema.safeParse(stats);

    expect(parsed.success ? null : parsed.error.message).toBeNull();
  });
});
