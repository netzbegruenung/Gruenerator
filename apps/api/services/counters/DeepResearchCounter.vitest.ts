import { describe, expect, it, beforeEach } from 'vitest';

import { DeepResearchCounter } from './DeepResearchCounter.js';

import type { RedisClient } from './types.js';

/**
 * Plain in-memory fake — no mock framework needed. Tracks call counts so
 * tests can assert "no Redis access happened" (empty userId / dead Redis).
 */
class FakeRedis implements RedisClient {
  store = new Map<string, string>();
  ttls = new Map<string, number>();
  isReady = true;
  calls = { get: 0, incr: 0, expire: 0, del: 0 };

  async get(key: string): Promise<string | null> {
    this.calls.get++;
    return this.store.get(key) ?? null;
  }

  async incr(key: string): Promise<number> {
    this.calls.incr++;
    const next = (parseInt(this.store.get(key) ?? '0', 10) || 0) + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.calls.expire++;
    this.ttls.set(key, seconds);
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    this.calls.del++;
    keys.forEach((k) => this.store.delete(k));
    return keys.length;
  }
}

describe('DeepResearchCounter', () => {
  let redis: FakeRedis;
  let counter: DeepResearchCounter;

  beforeEach(() => {
    redis = new FakeRedis();
    counter = new DeepResearchCounter(redis);
  });

  it('allows the first deep research of the day', async () => {
    const status = await counter.checkLimit('user-1');
    expect(status.canResearch).toBe(true);
    expect(status.remaining).toBe(1);
    expect(status.count).toBe(0);
    expect(status.limit).toBe(1);
  });

  it('blocks further research after one increment', async () => {
    await counter.incrementCount('user-1');
    const status = await counter.checkLimit('user-1');
    expect(status.canResearch).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.count).toBe(1);
  });

  it('rejects a second increment the same day without bumping the counter again', async () => {
    const first = await counter.incrementCount('user-1');
    expect(first.success).toBe(true);
    expect(first.count).toBe(1);

    const second = await counter.incrementCount('user-1');
    expect(second.success).toBe(false);
    expect(second.count).toBe(1);
    expect(second.canResearch).toBe(false);

    const today = new Date().toISOString().split('T')[0];
    expect(redis.store.get(`deep_research:user-1:${today}`)).toBe('1');
  });

  it('sets the TTL only on the first increment of the day', async () => {
    await counter.incrementCount('user-1');
    expect(redis.calls.expire).toBe(1);

    await counter.incrementCount('user-1');
    expect(redis.calls.expire).toBe(1);
  });

  it('fails closed for an empty userId without touching Redis', async () => {
    const status = await counter.checkLimit('');
    expect(status.canResearch).toBe(false);

    const result = await counter.incrementCount('');
    expect(result.success).toBe(false);
    expect(result.canResearch).toBe(false);

    expect(redis.calls.get).toBe(0);
    expect(redis.calls.incr).toBe(0);
    expect(redis.calls.expire).toBe(0);
  });

  it('fails closed immediately when Redis is not ready, instead of hanging', async () => {
    redis.isReady = false;

    const status = await counter.checkLimit('user-1');
    expect(status.canResearch).toBe(false);
    expect(redis.calls.get).toBe(0);

    const result = await counter.incrementCount('user-1');
    expect(result.success).toBe(false);
    expect(result.canResearch).toBe(false);
    expect(redis.calls.incr).toBe(0);
  });

  it('reports time until reset in the "Xh Ym" / "Ym" format', () => {
    const reset = counter.getTimeUntilReset();
    expect(reset).toMatch(/^(\d+h )?\d+m$/);
  });
});
