import { describe, expect, it, vi } from 'vitest';

import { SpeechSecondsCounter } from './SpeechSecondsCounter.js';

import type { RedisIncrByClient } from './types.js';

function fakeRedis(initial: Record<string, number> = {}): RedisIncrByClient & {
  store: Map<string, number>;
  ttl: Map<string, number>;
} {
  const store = new Map(Object.entries(initial));
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

describe('SpeechSecondsCounter', () => {
  it('starts empty, reserves atomically and arms a TTL', async () => {
    const redis = fakeRedis();
    const counter = new SpeechSecondsCounter(redis, 100);
    expect(await counter.status('u1')).toEqual({ usedSeconds: 0, limitSeconds: 100 });

    expect(await counter.reserve('u1', 42)).toEqual({
      ok: true,
      status: { usedSeconds: 42, limitSeconds: 100 },
    });
    const [key] = [...redis.store.keys()];
    expect(key).toMatch(/^speech_seconds:u1:\d{4}-\d{2}-\d{2}$/);
    expect(redis.ttl.get(key!)).toBeGreaterThan(0);
    expect(redis.ttl.get(key!)).toBeLessThanOrEqual(24 * 3600);
  });

  it('refuses and rolls back a reservation that would cross the limit', async () => {
    const redis = fakeRedis();
    const counter = new SpeechSecondsCounter(redis, 100);
    await counter.reserve('u1', 80);
    expect(await counter.reserve('u1', 21)).toEqual({ ok: false, reason: 'exceeded' });
    expect(await counter.status('u1')).toEqual({ usedSeconds: 80, limitSeconds: 100 });
    expect((await counter.reserve('u1', 20)).ok).toBe(true);
  });

  it('reconciles a reservation in both directions', async () => {
    const counter = new SpeechSecondsCounter(fakeRedis(), 100);
    await counter.reserve('u1', 50);
    expect(await counter.adjust('u1', -20)).toEqual({ usedSeconds: 30, limitSeconds: 100 });
    expect(await counter.adjust('u1', 5)).toEqual({ usedSeconds: 35, limitSeconds: 100 });
    expect(await counter.adjust('u1', 0)).toEqual({ usedSeconds: 35, limitSeconds: 100 });
  });

  it('fails closed on a dead Redis and on errors', async () => {
    const dead = { ...fakeRedis(), isReady: false };
    const counter = new SpeechSecondsCounter(dead, 100);
    expect(await counter.reserve('u1', 1)).toEqual({ ok: false, reason: 'unavailable' });

    const broken = fakeRedis();
    broken.get = vi.fn().mockRejectedValue(new Error('boom'));
    const erroring = new SpeechSecondsCounter(broken, 100);
    expect(await erroring.status('u1')).toEqual({ usedSeconds: 100, limitSeconds: 100 });
  });

  it('books nothing for a missing user', async () => {
    const redis = fakeRedis();
    const counter = new SpeechSecondsCounter(redis, 100);
    expect((await counter.reserve('', 10)).ok).toBe(false);
    expect(redis.store.size).toBe(0);
  });
});
