import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisClientMock = {
  isReady: true,
  incr: vi.fn(),
  expire: vi.fn(),
};

vi.mock('../../utils/redis/index.js', () => ({ redisClient: redisClientMock }));

const { shouldAttemptExtractionThisTurn } = await import('./extractionThrottle.js');

describe('shouldAttemptExtractionThisTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisClientMock.isReady = true;
  });

  it('allows extraction on the 3rd, 6th, ... turn and blocks the rest', async () => {
    redisClientMock.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    redisClientMock.expire.mockResolvedValue(1);

    expect(await shouldAttemptExtractionThisTurn('thread-1')).toBe(false);
    expect(await shouldAttemptExtractionThisTurn('thread-1')).toBe(false);
    expect(await shouldAttemptExtractionThisTurn('thread-1')).toBe(true);
  });

  it('sets the TTL only on the first turn (count === 1)', async () => {
    redisClientMock.incr.mockResolvedValueOnce(1);

    await shouldAttemptExtractionThisTurn('thread-1');

    expect(redisClientMock.expire).toHaveBeenCalledTimes(1);
    expect(redisClientMock.expire).toHaveBeenCalledWith(
      'mem0:extraction-turns:thread-1',
      30 * 24 * 60 * 60
    );
  });

  it('does not re-set the TTL on subsequent turns', async () => {
    redisClientMock.incr.mockResolvedValueOnce(2);

    await shouldAttemptExtractionThisTurn('thread-1');

    expect(redisClientMock.expire).not.toHaveBeenCalled();
  });

  it('fails open (allows extraction) when redis is not ready', async () => {
    redisClientMock.isReady = false;

    expect(await shouldAttemptExtractionThisTurn('thread-1')).toBe(true);
    expect(redisClientMock.incr).not.toHaveBeenCalled();
  });

  it('fails open (allows extraction) when redis throws', async () => {
    redisClientMock.incr.mockRejectedValueOnce(new Error('connection lost'));

    expect(await shouldAttemptExtractionThisTurn('thread-1')).toBe(true);
  });
});
