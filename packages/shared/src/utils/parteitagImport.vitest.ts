import { describe, expect, it, vi } from 'vitest';

import { isStillRunning, waitForHashes } from './parteitagImport';

describe('isStillRunning', () => {
  it.each([0, 502, 503, 504])('%s is transient', (s) => expect(isStillRunning(s)).toBe(true));
  it.each([200, 400, 403, 500])('%s is not', (s) => expect(isStillRunning(s)).toBe(false));
});

describe('waitForHashes', () => {
  it('polls until all hashes are stored', async () => {
    const fetchHashes = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ a: 'k/a' })
      .mockResolvedValueOnce({ a: 'k/a', b: 'k/b' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const ok = await waitForHashes({
      wanted: ['a', 'b'],
      fetchHashes,
      sleep,
      intervalMs: 5,
      maxAttempts: 10,
    });
    expect(ok).toBe(true);
    expect(fetchHashes).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts', async () => {
    const ok = await waitForHashes({
      wanted: ['a'],
      fetchHashes: async () => ({}),
      sleep: async () => undefined,
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(ok).toBe(false);
  });
});
