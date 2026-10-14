import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForCollabSync } from './waitForCollabSync';

function fakeProvider(unsynced: number) {
  const listeners = new Set<() => void>();
  const provider = {
    unsynced,
    get hasUnsyncedChanges() {
      return provider.unsynced > 0;
    },
    on: vi.fn((_event: string, fn: () => void) => {
      listeners.add(fn);
      return provider;
    }),
    off: vi.fn((_event: string, fn: () => void) => {
      listeners.delete(fn);
      return provider;
    }),
    ack() {
      provider.unsynced -= 1;
      for (const fn of [...listeners]) fn();
    },
    listeners,
  };
  return provider;
}

type Provider = Parameters<typeof waitForCollabSync>[0];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('waitForCollabSync', () => {
  it('resolves at once when everything is synced', async () => {
    const provider = fakeProvider(0);
    const settled = vi.fn();
    void waitForCollabSync(provider as unknown as Provider, 1000).then(settled);

    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toHaveBeenCalled();
    expect(provider.on).not.toHaveBeenCalled();
  });

  it('resolves at once without a provider', async () => {
    await expect(waitForCollabSync(null, 1000)).resolves.toBeUndefined();
  });

  it('waits until the last update is acked', async () => {
    const provider = fakeProvider(2);
    const settled = vi.fn();
    void waitForCollabSync(provider as unknown as Provider, 1000).then(settled);

    provider.ack();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    provider.ack();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalled();
    expect(provider.listeners.size).toBe(0);
  });

  it('gives up after the timeout and drops its listener', async () => {
    const provider = fakeProvider(1);
    const settled = vi.fn();
    void waitForCollabSync(provider as unknown as Provider, 1000).then(settled);

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
    expect(provider.listeners.size).toBe(0);
  });
});
