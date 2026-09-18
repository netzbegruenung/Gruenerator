import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TreeBudget,
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
  toTreeBudgetStatusDto,
  treeBudgetSpentMessage,
} from './treeBudget.js';

import type { RedisIncrByClient } from '../counters/types.js';

function fakeRedis(): RedisIncrByClient & { store: Map<string, number>; ttl: Map<string, number> } {
  const store = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    store,
    ttl,
    isReady: true,
    get: async (key) => (store.has(key) ? String(store.get(key)) : null),
    incr: async (key) => {
      store.set(key, (store.get(key) ?? 0) + 1);
      return store.get(key)!;
    },
    incrBy: async (key, by) => {
      store.set(key, (store.get(key) ?? 0) + by);
      return store.get(key)!;
    },
    expire: async (key, seconds) => {
      ttl.set(key, seconds);
      return true;
    },
    del: async () => 0,
  };
}

const NOON = '2026-09-18T12:00:00.000Z';
const DAY = '2026-09-18';

function metered(dailyUnits: number, newsletterBonus = false) {
  return async () => ({ unlimited: false as const, dailyUnits, newsletterBonus });
}

function budgetFor(
  redis: RedisIncrByClient,
  allowanceFor: (
    userId: string
  ) => Promise<
    { unlimited: true } | { unlimited: false; dailyUnits: number; newsletterBonus: boolean }
  >,
  nowIso = NOON
): TreeBudget {
  return new TreeBudget(redis, { allowanceFor, now: () => new Date(nowIso) });
}

describe('TreeBudget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('books a reservation, arms a TTL and rolls back what does not fit', async () => {
    const redis = fakeRedis();
    const budget = budgetFor(redis, metered(1000));

    expect(await budget.reserve('u1', 800)).toMatchObject({
      ok: true,
      status: { usedUnits: 800, limitUnits: 1000, remainingUnits: 200, newsletterBonus: false },
    });

    const [key] = [...redis.store.keys()];
    expect(key).toMatch(/^trees:u1:\d{4}-\d{2}-\d{2}$/);
    expect(redis.ttl.get(key!)).toBeGreaterThan(0);

    const refused = await budget.reserve('u1', 201);
    expect(refused).toMatchObject({ ok: false, reason: 'exceeded', status: { usedUnits: 800 } });
    expect(redis.store.get(key!)).toBe(800);

    expect((await budget.reserve('u1', 200)).ok).toBe(true);
    expect(await budget.status('u1')).toMatchObject({ usedUnits: 1000, remainingUnits: 0 });
  });

  it('adjusts in both directions and floors the stored counter at zero', async () => {
    const redis = fakeRedis();
    const budget = budgetFor(redis, metered(1000));
    await budget.reserve('u1', 500);

    expect(await budget.adjust('u1', -200, DAY)).toMatchObject({
      usedUnits: 300,
      remainingUnits: 700,
    });
    expect(await budget.adjust('u1', 50, DAY)).toMatchObject({ usedUnits: 350 });
    expect(await budget.release('u1', 350, DAY)).toMatchObject({
      usedUnits: 0,
      remainingUnits: 1000,
    });
    expect(await budget.release('u1', 100, DAY)).toMatchObject({ usedUnits: 0 });
    // Not just the display: a negative base would hand out free units for the
    // rest of the day, because `reserve` compares the raw INCRBY result.
    expect(redis.store.get(`trees:u1:${DAY}`)).toBe(0);
  });

  it('settles a release against the reservation day, not against the clock', async () => {
    const redis = fakeRedis();
    let nowIso = '2026-09-18T23:59:30.000Z';
    const budget = new TreeBudget(redis, {
      allowanceFor: metered(1000),
      now: () => new Date(nowIso),
    });

    const reserved = await budget.reserve('u1', 300);
    expect(reserved.ok && reserved.status.day).toBe('2026-09-18');

    // The job outlived the UTC day. Yesterday's key is gone, so there is
    // nothing to give back — and the new day must not open at -300.
    nowIso = '2026-09-19T00:00:30.000Z';
    expect(await budget.release('u1', 300, '2026-09-18')).toMatchObject({
      usedUnits: 0,
      remainingUnits: 1000,
      day: '2026-09-19',
    });
    expect([...redis.store.keys()]).toEqual(['trees:u1:2026-09-18']);
    expect(redis.store.get('trees:u1:2026-09-18')).toBe(300);
    expect(await budget.reserve('u1', 1000)).toMatchObject({ ok: true });
  });

  it('releases onto the reservation key while that day is still running', async () => {
    const redis = fakeRedis();
    let nowIso = '2026-09-18T22:00:00.000Z';
    const budget = new TreeBudget(redis, {
      allowanceFor: metered(1000),
      now: () => new Date(nowIso),
    });
    const reserved = await budget.reserve('u1', 300);

    nowIso = '2026-09-18T23:30:00.000Z';
    await budget.release('u1', 300, reserved.ok ? reserved.status.day : '');
    expect(redis.store.get('trees:u1:2026-09-18')).toBe(0);
  });

  it('fails closed instead of throwing when the allowance lookup dies', async () => {
    const redis = fakeRedis();
    const budget = budgetFor(redis, async () => {
      throw new Error('Postgres weg');
    });

    expect(await budget.reserve('u1', 100)).toEqual({ ok: false, reason: 'unavailable' });
    await expect(budget.adjust('u1', -100, DAY)).resolves.toMatchObject({ remainingUnits: 0 });
    await expect(budget.release('u1', 100, DAY)).resolves.toMatchObject({ remainingUnits: 0 });
    await expect(budget.status('u1')).resolves.toMatchObject({ remainingUnits: 0 });
    expect(redis.store.size).toBe(0);
  });

  it('keeps a booking whose TTL could not be armed', async () => {
    const redis = fakeRedis();
    redis.expire = vi.fn().mockRejectedValue(new Error('EXPIRE weg'));
    const budget = budgetFor(redis, metered(1000));

    expect(await budget.reserve('u1', 100)).toMatchObject({
      ok: true,
      status: { usedUnits: 100 },
    });
    expect(redis.store.get(`trees:u1:${DAY}`)).toBe(100);
  });

  it('never touches Redis on an unlimited instance, even with Redis down', async () => {
    const redis = { ...fakeRedis(), isReady: false };
    const budget = budgetFor(redis, async () => ({ unlimited: true as const }));

    expect(await budget.reserve('u1', 500)).toMatchObject({
      ok: true,
      status: { usedUnits: 0, limitUnits: null, remainingUnits: null },
    });
    expect(await budget.status('u1')).toMatchObject({ limitUnits: null, remainingUnits: null });
    expect(redis.store.size).toBe(0);
  });

  it('carries the newsletter bonus into every balance', async () => {
    const budget = budgetFor(fakeRedis(), metered(1500, true));
    expect(await budget.status('u1')).toMatchObject({
      limitUnits: 1500,
      newsletterBonus: true,
    });
  });

  it('fails closed on a dead Redis, on read errors and without a user', async () => {
    const dead = { ...fakeRedis(), isReady: false };
    const deadBudget = budgetFor(dead, metered(1000));
    expect(await deadBudget.reserve('u1', 100)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await deadBudget.status('u1')).toMatchObject({ usedUnits: 1000, remainingUnits: 0 });
    expect(await deadBudget.adjust('u1', -100, DAY)).toMatchObject({ usedUnits: 1000 });

    const broken = fakeRedis();
    broken.get = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await budgetFor(broken, metered(1000)).status('u1')).toMatchObject({
      usedUnits: 1000,
      remainingUnits: 0,
    });

    const redis = fakeRedis();
    expect(await budgetFor(redis, metered(1000)).reserve('', 100)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(redis.store.size).toBe(0);
  });

  it('keys and expires on the same UTC clock', async () => {
    const redis = fakeRedis();
    const late = budgetFor(redis, metered(1000), '2026-09-18T23:59:30.000Z');
    const reserved = await late.reserve('u1', 100);

    expect([...redis.store.keys()]).toEqual(['trees:u1:2026-09-18']);
    expect(redis.ttl.get('trees:u1:2026-09-18')).toBe(60);
    expect(reserved.ok && reserved.status.resetsAt.toISOString()).toBe('2026-09-19T00:00:00.000Z');

    const tomorrow = fakeRedis();
    const next = budgetFor(tomorrow, metered(1000), '2026-09-19T00:00:30.000Z');
    await next.reserve('u1', 100);
    expect([...tomorrow.store.keys()]).toEqual(['trees:u1:2026-09-19']);
    expect((await next.status('u1')).resetsAt.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it('maps a balance onto the wire DTO in Bäume', () => {
    expect(
      toTreeBudgetStatusDto({
        usedUnits: 250,
        limitUnits: 1500,
        remainingUnits: 1250,
        resetsAt: new Date('2026-09-19T00:00:00.000Z'),
        newsletterBonus: true,
        day: DAY,
      })
    ).toEqual({
      used: 2.5,
      limit: 15,
      remaining: 12.5,
      resetsAt: '2026-09-19T00:00:00.000Z',
      newsletterBonus: true,
    });

    expect(
      toTreeBudgetStatusDto({
        usedUnits: 0,
        limitUnits: null,
        remainingUnits: null,
        resetsAt: new Date('2026-09-19T00:00:00.000Z'),
        newsletterBonus: false,
        day: DAY,
      })
    ).toMatchObject({ limit: null, remaining: null });
  });
});

describe('treeBudgetSpentMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const resetsAt = new Date('2026-09-19T00:00:00.000Z');

  function at(iso: string): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it('names the whole allowance when nothing is left', () => {
    at('2026-09-18T18:48:00.000Z');
    expect(
      treeBudgetSpentMessage({
        usedUnits: 1500,
        limitUnits: 1500,
        remainingUnits: 0,
        resetsAt,
        newsletterBonus: true,
        day: DAY,
      })
    ).toBe('Dein Tagesbudget von 15 Bäumen ist aufgebraucht – in 5 h 12 min gibt es wieder 15.');

    expect(
      treeBudgetSpentMessage({
        usedUnits: 100,
        limitUnits: 100,
        remainingUnits: 0,
        resetsAt,
        newsletterBonus: false,
        day: DAY,
      })
    ).toBe('Dein Tagesbudget von 1 Baum ist aufgebraucht – in 5 h 12 min gibt es wieder 1.');
  });

  it('names what is missing when the rest does not fit', () => {
    at('2026-09-18T18:48:00.000Z');
    expect(
      treeBudgetSpentMessage(
        {
          usedUnits: 1350,
          limitUnits: 1500,
          remainingUnits: 150,
          resetsAt,
          newsletterBonus: true,
          day: DAY,
        },
        250
      )
    ).toBe(
      'Dafür brauchst du 2,5 Bäume, heute sind nur noch 1,5 von 15 übrig – in 5 h 12 min gibt es wieder 15.'
    );
  });

  it('says "1 Baum" in the singular and drops the hour under an hour', () => {
    at('2026-09-18T23:20:00.000Z');
    expect(
      treeBudgetSpentMessage(
        {
          usedUnits: 950,
          limitUnits: 1000,
          remainingUnits: 50,
          resetsAt,
          newsletterBonus: false,
          day: DAY,
        },
        100
      )
    ).toBe(
      'Dafür brauchst du 1 Baum, heute sind nur noch 0,5 von 10 übrig – in 40 min gibt es wieder 10.'
    );
  });
});

describe('reserveOrThrow', () => {
  it('throws the exceeded error with the balance and the missing amount', async () => {
    const budget = budgetFor(fakeRedis(), metered(100));
    await expect(budget.reserveOrThrow('u1', 200)).rejects.toBeInstanceOf(TreeBudgetExceededError);
  });

  it('throws the unavailable error when Redis is down', async () => {
    const budget = budgetFor({ ...fakeRedis(), isReady: false }, metered(1000));
    await expect(budget.reserveOrThrow('u1', 100)).rejects.toBeInstanceOf(
      TreeBudgetUnavailableError
    );
  });

  it('returns the balance after a successful booking', async () => {
    const budget = budgetFor(fakeRedis(), metered(1000));
    expect(await budget.reserveOrThrow('u1', 250)).toMatchObject({
      usedUnits: 250,
      remainingUnits: 750,
    });
  });
});
