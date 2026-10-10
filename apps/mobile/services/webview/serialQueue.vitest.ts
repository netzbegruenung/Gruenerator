import { describe, expect, it, vi } from 'vitest';

import { createSerialQueue } from './serialQueue';

describe('createSerialQueue', () => {
  it('starts a task only after the previous one settled', async () => {
    const log: string[] = [];
    let releaseFirst = () => {};
    const enqueue = createSerialQueue(() => {});

    void enqueue(
      () =>
        new Promise<void>((resolve) => {
          log.push('first:start');
          releaseFirst = () => {
            log.push('first:end');
            resolve();
          };
        })
    );
    const second = enqueue(async () => {
      log.push('second:start');
    });

    await Promise.resolve();
    expect(log).toEqual(['first:start']);
    releaseFirst();
    await second;
    expect(log).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('reports a failure and still runs what was queued behind it', async () => {
    const onError = vi.fn();
    const enqueue = createSerialQueue(onError);
    const after = vi.fn(async () => {});

    void enqueue(() => Promise.reject(new Error('kaputt')));
    await enqueue(after);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
