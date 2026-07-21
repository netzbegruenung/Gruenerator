/**
 * Unit tests for AbgeordnetenwatchApiClient.
 *
 * The client's whole job is precision: pin server-side filters and return
 * trimmed, LLM-safe DTOs. These tests pin the invariants that matter for
 * context safety and correctness:
 *
 *   1. DTOs are trimmed — raw API boilerplate (`entity_type`, `api_url`, deep
 *      nesting) never leaks into the returned shape.
 *   2. Roll-call tallies are aggregated locally into four counts + per-fraction
 *      breakdown (the API has no aggregate endpoint).
 *   3. Side-job `income_level` is parsed to a number; income passes through.
 *   4. Transient 429s are retried with backoff, then surface if they persist.
 *
 * axios, env, the SSRF check, the Redis cache and the logger are all mocked so
 * the tests are hermetic (no network, no redis).
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';

// ── Module mocks (hoisted above imports by vitest) ──────────────────────────
const getMock = vi.fn();

vi.mock('axios', () => ({
  default: { create: () => ({ get: getMock }) },
}));

vi.mock('../../config/env.js', () => ({
  env: { ABGEORDNETENWATCH_BASE_URL: 'https://www.abgeordnetenwatch.de/api/v2' },
}));

vi.mock('../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: vi.fn(async () => ({ isValid: true })),
}));

vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async () => null), // always a cache miss → produce runs
  setCachedJson: vi.fn(async () => undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AbgeordnetenwatchApiClient } from './abgeordnetenwatchApiClient.js';

const envelope = (data: unknown, total?: number) => ({
  data: { meta: { result: { total: total ?? (Array.isArray(data) ? data.length : 1) } }, data },
});

beforeEach(() => {
  getMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AbgeordnetenwatchApiClient — DTO trimming', () => {
  it('searchPoliticians returns only the trimmed fields', async () => {
    getMock.mockResolvedValueOnce(
      envelope([
        {
          id: 139064,
          entity_type: 'politician',
          api_url: 'https://www.abgeordnetenwatch.de/api/v2/politicians/139064',
          label: 'Robert Habeck',
          first_name: 'Robert',
          last_name: 'Habeck',
          party: { id: 5, label: 'GRÜNE' },
          abgeordnetenwatch_url: 'https://www.abgeordnetenwatch.de/profile/robert-habeck',
        },
      ])
    );

    const client = await AbgeordnetenwatchApiClient.create();
    const result = await client.searchPoliticians('Habeck');

    expect(result).toEqual([
      {
        id: 139064,
        name: 'Robert Habeck',
        party: 'GRÜNE',
        url: 'https://www.abgeordnetenwatch.de/profile/robert-habeck',
      },
    ]);
    // Trimming invariant: no raw API keys leak.
    expect(result[0]).not.toHaveProperty('entity_type');
    expect(result[0]).not.toHaveProperty('api_url');
  });

  it('getVotes trims to poll + vote + fraction', async () => {
    getMock.mockResolvedValueOnce(
      envelope([
        {
          id: 662044,
          entity_type: 'vote',
          vote: 'yes',
          mandate: { id: 70563, label: 'X (Bundestag)' },
          poll: {
            id: 6575,
            label: 'Bundeswehreinsatz im Libanon',
            abgeordnetenwatch_url:
              'https://www.abgeordnetenwatch.de/bundestag/abstimmungen/libanon',
          },
          fraction: { label: 'SPD' },
        },
      ])
    );

    const client = await AbgeordnetenwatchApiClient.create();
    const votes = await client.getVotes({ mandateId: 70563 });

    expect(votes).toEqual([
      {
        pollId: 6575,
        pollLabel: 'Bundeswehreinsatz im Libanon',
        vote: 'yes',
        fraction: 'SPD',
        url: 'https://www.abgeordnetenwatch.de/bundestag/abstimmungen/libanon',
      },
    ]);
  });

  it('getSideJobs parses income_level to a number and keeps income', async () => {
    getMock.mockResolvedValueOnce(
      envelope([
        {
          id: 1,
          label: 'Vertragspartner',
          income: 3928061.19,
          income_level: '10',
          interval: null,
          job_title_extra: 'Einkommen im Jahr 2022',
          sidejob_organization: { label: 'Landwirtschaftsbetrieb' },
          field_topics: [{ label: 'Landwirtschaft' }],
        },
      ])
    );

    const client = await AbgeordnetenwatchApiClient.create();
    const [job] = await client.getSideJobs(70563);

    expect(job).toEqual({
      label: 'Vertragspartner',
      organization: 'Landwirtschaftsbetrieb',
      income: 3928061.19,
      incomeLevel: 10,
      interval: null,
      year: 'Einkommen im Jahr 2022',
      topics: ['Landwirtschaft'],
    });
    expect(typeof job.incomeLevel).toBe('number');
  });
});

describe('AbgeordnetenwatchApiClient — roll-call aggregation', () => {
  it('getPollTally aggregates votes into counts + per-fraction breakdown', async () => {
    const votes = [
      { id: 1, vote: 'yes', fraction: { label: 'SPD' } },
      { id: 2, vote: 'yes', fraction: { label: 'SPD' } },
      { id: 3, vote: 'yes', fraction: { label: 'GRÜNE' } },
      { id: 4, vote: 'no', fraction: { label: 'CDU' } },
      { id: 5, vote: 'abstain', fraction: { label: 'CDU' } },
      { id: 6, vote: 'no_show', fraction: { label: 'GRÜNE' } },
    ];

    // getPollTally fires two requests in parallel: polls/<id> then votes?poll=<id>.
    getMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/polls/6575')) {
        return {
          data: {
            meta: {},
            data: {
              id: 6575,
              label: 'Bundeswehreinsatz im Libanon',
              field_poll_date: '2026-06-25',
              field_accepted: true,
              abgeordnetenwatch_url:
                'https://www.abgeordnetenwatch.de/bundestag/abstimmungen/libanon',
            },
          },
        };
      }
      return envelope(votes);
    });

    const client = await AbgeordnetenwatchApiClient.create();
    const tally = await client.getPollTally(6575);

    expect(tally?.total).toEqual({ yes: 3, no: 1, abstain: 1, no_show: 1 });
    expect(tally?.accepted).toBe(true);
    expect(tally?.label).toBe('Bundeswehreinsatz im Libanon');

    const spd = tally?.byFraction.find((f) => f.fraction === 'SPD');
    expect(spd).toMatchObject({ yes: 2, no: 0, abstain: 0, no_show: 0 });
    const gruene = tally?.byFraction.find((f) => f.fraction === 'GRÜNE');
    expect(gruene).toMatchObject({ yes: 1, no_show: 1 });
    // Aggregate only — no raw vote rows leak into the DTO.
    expect(tally).not.toHaveProperty('votes');
  });
});

describe('AbgeordnetenwatchApiClient — 429 backoff', () => {
  it('retries a transient 429 and then succeeds', async () => {
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 429 } })
      .mockResolvedValueOnce(envelope([{ id: 1, label: 'A', abgeordnetenwatch_url: 'u' }]));

    const client = await AbgeordnetenwatchApiClient.create();
    const promise = client.searchPoliticians('A');
    await vi.advanceTimersByTimeAsync(1500); // clear the 1s backoff
    const result = await promise;

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result[0].name).toBe('A');
  });

  it('surfaces a persistent 429 after exhausting retries', async () => {
    vi.useFakeTimers();
    getMock.mockRejectedValue({ isAxiosError: true, response: { status: 429 } });

    const client = await AbgeordnetenwatchApiClient.create();
    const promise = client.searchPoliticians('A').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000); // 1s + 2s backoffs
    const outcome = await promise;

    expect(outcome).toBeTruthy();
    expect(getMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
