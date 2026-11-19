import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForSynced } from './waitForSynced';

function fakeProvider(initial: number) {
  const listeners = new Set<() => void>();
  const provider = {
    unsyncedChanges: initial,
    on: (_event: string, fn: () => void) => listeners.add(fn),
    off: (_event: string, fn: () => void) => listeners.delete(fn),
  };
  return {
    provider: provider as never,
    set(n: number) {
      provider.unsyncedChanges = n;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

describe('waitForSynced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves immediately at 0', async () => {
    const p = fakeProvider(0);
    await expect(waitForSynced(p.provider, 5000)).resolves.toBeUndefined();
    expect(p.listeners.size).toBe(0);
  });

  it('resolves on the event that brings it to 0', async () => {
    const p = fakeProvider(2);
    const done = vi.fn();
    void waitForSynced(p.provider, 5000).then(done);
    p.set(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).not.toHaveBeenCalled();
    p.set(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
    expect(p.listeners.size).toBe(0);
  });

  it('rejects after the timeout and detaches', async () => {
    const p = fakeProvider(3);
    const result = waitForSynced(p.provider, 5000);
    const caught = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await caught;
    expect(p.listeners.size).toBe(0);
  });
});
