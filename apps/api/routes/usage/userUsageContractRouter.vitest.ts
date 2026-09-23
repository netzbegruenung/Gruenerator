/**
 * The personal "Nutzung" tab: how `getMyUsage` turns daily rows into totals
 * and a footprint.
 *
 * The footprint rules mirror `platformUsageStats.ts` line for line but were
 * pinned only there. The one this file exists for is #3544: a row whose
 * measurement covers only some of its calls must count that part as measured
 * and estimate the rest, not book the unmeasured calls at zero energy.
 *
 * Drizzle is faked at the query level; `select().from().where()` resolves to
 * the rows a test hands in.
 */

import { getUserUsageResponseSchema, type GetUserUsageResponseDto } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { estimateFootprint } from '../../services/usage/energyFootprint.js';

import type { Request } from 'express';

let rows: Array<Record<string, unknown>> = [];
let failure: Error | null = null;

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({ where: () => (failure ? Promise.reject(failure) : Promise.resolve(rows)) }),
    }),
  }),
}));

const { userUsageContractRouter } = await import('./userUsageContractRouter.js');

const req = { user: { id: 'user-1' } } as unknown as Request;

/** One daily row, with the zero-heavy fields defaulted away. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: 'user-1',
    day: '2026-09-22',
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
    updatedAt: new Date('2026-09-22T12:00:00Z'),
    ...over,
  };
}

async function usage() {
  const res = await userUsageContractRouter.getMyUsage({ req, query: { days: 30 } } as never);
  expect(res.status).toBe(200);
  return res.body as GetUserUsageResponseDto;
}

/** The central estimate for part of a gemma4-31b row, in Wh. */
function estimateWh(part: { requests: number; inputTokens: number; outputTokens: number }) {
  const estimate = estimateFootprint({ provider: 'greenpt', model: 'gemma4-31b', ...part });
  if (!estimate) throw new Error('gemma4-31b lost its coefficients');
  return estimate.energyWms / 3_600_000;
}

beforeEach(() => {
  rows = [];
  failure = null;
});

describe('getMyUsage footprint', () => {
  it('estimates the calls a partly measured row carries without a measurement', async () => {
    rows = [
      row({
        energyWms: 3_600_000,
        emissionsUg: 1_000_000,
        measuredRequests: 6,
        measuredInputTokens: 3000,
        measuredOutputTokens: 600,
      }),
    ];
    const rest = estimateWh({ requests: 4, inputTokens: 2000, outputTokens: 400 });

    const { footprint } = await usage();

    expect(rest).toBeGreaterThan(0);
    expect(footprint.energy_wh).toBeCloseTo(1 + rest, 9);
    expect(footprint.measured_share).toBeCloseTo(1 / (1 + rest), 9);
    // Every output token is accounted for: the measured 600 and the estimated 400.
    expect(footprint.covered_share).toBeCloseTo(1, 9);
  });

  it('adds nothing on top of a fully measured row', async () => {
    rows = [
      row({
        energyWms: 3_600_000,
        emissionsUg: 1_000_000,
        measuredRequests: 10,
        measuredInputTokens: 5000,
        measuredOutputTokens: 1000,
      }),
    ];

    const { footprint } = await usage();

    expect(footprint.energy_wh).toBeCloseTo(1, 9);
    expect(footprint.emissions_g).toBeCloseTo(1, 9);
    expect(footprint.measured_share).toBeCloseTo(1, 9);
    expect(footprint.covered_share).toBeCloseTo(1, 9);
  });

  it('estimates a row without any measurement in full', async () => {
    rows = [row()];

    const { footprint } = await usage();

    expect(footprint.energy_wh).toBeCloseTo(
      estimateWh({ requests: 10, inputTokens: 5000, outputTokens: 1000 }),
      9
    );
    expect(footprint.measured_share).toBe(0);
    expect(footprint.covered_share).toBeCloseTo(1, 9);
  });

  it('never estimates a negative remainder where the meter saw more than was booked', async () => {
    // Rerank books no tokens of its own, only the measured impact.
    rows = [
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
    ];

    const { footprint } = await usage();

    expect(footprint.energy_wh).toBeCloseTo(1, 9);
    expect(footprint.measured_share).toBeCloseTo(1, 9);
  });
});

describe('getMyUsage response', () => {
  it('sums a mixed window and matches the contract', async () => {
    rows = [
      row(),
      row({ day: '2026-09-21', feature: 'texte' }),
      row({ provider: 'bfl', model: 'flux-2-pro', unit: 'images', ops: 2, requests: 0 }),
      row({ feature: 'feature-from-a-later-release', unit: 'unit-from-a-later-release' }),
    ];

    const body = await usage();

    expect(getUserUsageResponseSchema.safeParse(body).success).toBe(true);
    expect(body.totals.requests).toBe(30);
    expect(body.totals.images).toBe(2);
    expect(body.daily.map((d) => d.day)).toEqual(['2026-09-21', '2026-09-22']);
    // Unknown slugs from newer rows fall back instead of failing the response:
    // the feature to 'other', the unit to 'tokens'.
    expect(body.byFeature.map((f) => f.feature).sort()).toEqual(['chat', 'other', 'texte']);
    expect(body.byFeature.find((f) => f.feature === 'other')?.total_tokens).toBe(6000);
  });

  it('answers an empty window with zeros, not NaN', async () => {
    const body = await usage();

    expect(getUserUsageResponseSchema.safeParse(body).success).toBe(true);
    expect(body.totals.requests).toBe(0);
    expect(body.footprint.measured_share).toBe(0);
    expect(body.footprint.covered_share).toBe(0);
  });

  it('turns a database failure into a 500', async () => {
    failure = new Error('connection reset');
    const res = await userUsageContractRouter.getMyUsage({
      req,
      query: { days: 30 },
    } as never);

    expect(res.status).toBe(500);
  });
});
