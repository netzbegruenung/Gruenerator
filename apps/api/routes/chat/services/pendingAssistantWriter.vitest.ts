/**
 * Unit tests for the pending-assistant writer (turn-persistence WP-B).
 *
 * The writer buffers streamed reply text and throttles it to the placeholder
 * chat_messages row. These tests pin the guarantees the router relies on:
 *   - no DB write until something is buffered;
 *   - at most one write per interval regardless of delta count;
 *   - `completion` REPLACES the buffer (citation-clamp corrected full text);
 *   - `stop()` awaits any in-flight write and flushes a final dirty buffer;
 *   - a flush error is swallowed (persistence must never break the stream);
 *   - flushes never overlap (serialized — never two UPDATEs racing the row).
 *
 * The DB update is injected, so no Postgres and no fake DB — just the timer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPendingAssistantWriter } from './pendingAssistantWriter.js';

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPendingAssistantWriter', () => {
  it('does not write when no text was buffered', async () => {
    const updateFn = vi.fn(async () => {});
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    vi.advanceTimersByTime(500);
    await flushMicrotasks();

    expect(updateFn).not.toHaveBeenCalled();
    await w.stop();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('flushes at most once per interval regardless of delta count', async () => {
    const updateFn = vi.fn(async () => {});
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    w.onText('delta', 'a');
    w.onText('delta', 'b');
    w.onText('delta', 'c');

    vi.advanceTimersByTime(100);
    await flushMicrotasks();

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledWith('m1', 'abc');

    // No new deltas → next tick is a no-op.
    vi.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(updateFn).toHaveBeenCalledTimes(1);

    await w.stop();
  });

  it('appends deltas but REPLACES the buffer on completion', async () => {
    const updateFn = vi.fn(async () => {});
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    w.onText('delta', 'Hallo ');
    w.onText('delta', 'Welt');
    w.onText('completion', 'Hallo Welt [1]'); // clamped full text replaces

    vi.advanceTimersByTime(100);
    await flushMicrotasks();

    expect(updateFn).toHaveBeenLastCalledWith('m1', 'Hallo Welt [1]');
    await w.stop();
  });

  it('stop() flushes a final dirty buffer even without a tick', async () => {
    const updateFn = vi.fn(async () => {});
    const w = createPendingAssistantWriter('m1', 10_000, updateFn);

    w.onText('delta', 'tail');
    // No timer advance — the interval never fired.
    await w.stop();

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledWith('m1', 'tail');
  });

  it('stop() awaits an in-flight flush, then flushes the newer buffer', async () => {
    const resolvers: Array<() => void> = [];
    const updateFn = vi.fn(
      (_id: string, _text: string) => new Promise<void>((res) => resolvers.push(res))
    );
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    w.onText('delta', 'x');
    vi.advanceTimersByTime(100); // starts flush #1 (in-flight, unresolved)
    await flushMicrotasks();
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenNthCalledWith(1, 'm1', 'x');

    w.onText('delta', 'y'); // buffer now 'xy', dirty

    const stopPromise = w.stop();
    await flushMicrotasks();
    // Still blocked on the in-flight write — no second call yet.
    expect(updateFn).toHaveBeenCalledTimes(1);

    resolvers[0](); // let flush #1 finish
    await flushMicrotasks();
    resolvers[1]?.(); // let the final flush finish
    await stopPromise;

    expect(updateFn).toHaveBeenCalledTimes(2);
    expect(updateFn).toHaveBeenNthCalledWith(2, 'm1', 'xy');
  });

  it('swallows a flush error (never throws into the stream)', async () => {
    const updateFn = vi.fn(async () => {
      throw new Error('db down');
    });
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    w.onText('delta', 'a');
    vi.advanceTimersByTime(100);
    await expect(flushMicrotasks()).resolves.toBeUndefined();
    expect(updateFn).toHaveBeenCalledTimes(1);

    // stop() must also not reject even though the final flush throws.
    w.onText('delta', 'b');
    await expect(w.stop()).resolves.toBeUndefined();
  });

  it('never runs two flushes in parallel', async () => {
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const updateFn = vi.fn(
      (_id: string, _text: string) =>
        new Promise<void>((res) => {
          active++;
          maxActive = Math.max(maxActive, active);
          resolvers.push(() => {
            active--;
            res();
          });
        })
    );
    const w = createPendingAssistantWriter('m1', 100, updateFn);

    w.onText('delta', 'a');
    vi.advanceTimersByTime(100); // flush #1 in-flight
    await flushMicrotasks();

    w.onText('delta', 'b');
    vi.advanceTimersByTime(100); // tick sees in-flight → must NOT start a 2nd write
    await flushMicrotasks();
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);

    resolvers[0](); // finish #1
    await flushMicrotasks();

    vi.advanceTimersByTime(100); // now the pending 'ab' flushes
    await flushMicrotasks();
    expect(updateFn).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1); // #1 finished before #2 started

    resolvers[1]?.();
    await w.stop();
  });
});
