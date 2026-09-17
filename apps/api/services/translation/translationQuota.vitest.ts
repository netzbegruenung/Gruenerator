import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: { DEEPL_DAILY_CHARS_PER_USER: 100 } }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const redis = { get: vi.fn(), incrBy: vi.fn(), expire: vi.fn() };
vi.mock('../../utils/redis/client.js', () => ({ default: redis }));

const { assertQuota, settleQuota, getQuota, TranslationQuotaExceededError } =
  await import('./translationQuota.js');

beforeEach(() => {
  redis.get.mockReset().mockResolvedValue(null);
  redis.incrBy.mockReset();
  redis.expire.mockReset().mockResolvedValue(true);
});

describe('translationQuota', () => {
  it('lets a call through while the estimate fits', async () => {
    redis.get.mockResolvedValue('40');
    await expect(assertQuota('u1', 60)).resolves.toEqual({ used: 40, limit: 100 });
  });

  it('refuses when the estimate would cross the limit', async () => {
    redis.get.mockResolvedValue('41');
    await expect(assertQuota('u1', 60)).rejects.toBeInstanceOf(TranslationQuotaExceededError);
  });

  it('books billed characters under a per-day key with a TTL on first write', async () => {
    redis.incrBy.mockResolvedValue(25);
    const status = await settleQuota('u1', 25);
    const key = redis.incrBy.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^deepl:chars:u1:\d{4}-\d{2}-\d{2}$/);
    expect(redis.expire).toHaveBeenCalledWith(key, 48 * 60 * 60);
    expect(status).toEqual({ used: 25, limit: 100 });

    redis.incrBy.mockResolvedValue(50);
    await settleQuota('u1', 25);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('fails open when Redis is unreachable', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(assertQuota('u1', 99)).resolves.toEqual({ used: 0, limit: 100 });
    await expect(getQuota('u1')).resolves.toEqual({ used: 0, limit: 100 });
  });
});
