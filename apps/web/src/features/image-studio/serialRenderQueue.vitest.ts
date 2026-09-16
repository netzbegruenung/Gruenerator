import { describe, it, expect } from 'vitest';

import { createSerialQueue } from './serialRenderQueue';

/** A task whose completion the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSerialQueue', () => {
  it('runs one identical task for concurrent callers and gives them all its result', async () => {
    const queue = createSerialQueue<string>();
    let runs = 0;
    const gate = deferred<string>();

    const task = () => {
      runs += 1;
      return gate.promise;
    };

    // The hero card and its own chip ask for the same picture in one commit.
    const first = queue.run('dreizeilen:a', task);
    const second = queue.run('dreizeilen:a', task);
    const third = queue.run('dreizeilen:a', task);

    gate.resolve('data:image/png;base64,AAA');

    expect(await Promise.all([first, second, third])).toEqual([
      'data:image/png;base64,AAA',
      'data:image/png;base64,AAA',
      'data:image/png;base64,AAA',
    ]);
    expect(runs).toBe(1);
  });

  it('never exceeds the concurrency limit, however many are asked for at once', async () => {
    const limit = 3;
    const queue = createSerialQueue<string>(limit);
    let active = 0;
    let maxActive = 0;
    const gates = Array.from({ length: 12 }, () => deferred<string>());

    const taskFor = (i: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const result = await gates[i]!.promise;
      active -= 1;
      return result;
    };

    // A thread with several sharepics asks for every preview in one commit.
    const all = Promise.all(gates.map((_, i) => queue.run(`key-${i}`, taskFor(i))));

    expect(maxActive).toBe(limit);

    gates.forEach((gate, i) => gate.resolve(`img-${i}`));

    expect(await all).toEqual(gates.map((_, i) => `img-${i}`));
    expect(maxActive).toBe(limit);
  });

  it('starts a queued task as soon as a slot frees up', async () => {
    const queue = createSerialQueue<string>(1);
    const first = deferred<string>();
    let secondStarted = false;

    const a = queue.run('a', () => first.promise);
    const b = queue.run('b', () => {
      secondStarted = true;
      return Promise.resolve('b-done');
    });

    expect(secondStarted).toBe(false);
    first.resolve('a-done');

    expect(await a).toBe('a-done');
    expect(await b).toBe('b-done');
    expect(secondStarted).toBe(true);
  });

  it('keeps draining after a task yields no result', async () => {
    const queue = createSerialQueue<string | null>();

    // A render that times out resolves null rather than rejecting; the queue
    // must hand that null back and move on to the next job.
    const failed = await queue.run('broken', () => Promise.resolve(null));
    const next = await queue.run('fine', () => Promise.resolve('img'));

    expect(failed).toBeNull();
    expect(next).toBe('img');
  });

  it('re-runs a key that already finished', async () => {
    const queue = createSerialQueue<string>();
    let runs = 0;
    const task = () => {
      runs += 1;
      return Promise.resolve(`run-${runs}`);
    };

    // Dedup joins work in flight; it is not a result cache. An edited sharepic
    // re-renders under a new key anyway, but a repeat of the same key must not
    // silently replay a stale image.
    expect(await queue.run('same', task)).toBe('run-1');
    expect(await queue.run('same', task)).toBe('run-2');
    expect(runs).toBe(2);
  });
});
