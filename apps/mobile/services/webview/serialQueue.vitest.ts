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

  it('drops the rest of a batch after a failure and reports it once', async () => {
    const onError = vi.fn();
    const enqueue = createSerialQueue(onError);
    const page2 = vi.fn(() => Promise.reject(new Error('auch kaputt')));
    const page3 = vi.fn(async () => {});

    void enqueue(() => Promise.reject(new Error('kaputt')));
    void enqueue(page2);
    await enqueue(page3);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(page2).not.toHaveBeenCalled();
    expect(page3).not.toHaveBeenCalled();
  });

  it('runs a task enqueued after the failure', async () => {
    const onError = vi.fn();
    const enqueue = createSerialQueue(onError);
    await enqueue(() => Promise.reject(new Error('kaputt')));

    const next = vi.fn(async () => {});
    await enqueue(next);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
