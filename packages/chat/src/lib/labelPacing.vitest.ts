import { describe, it, expect, vi } from 'vitest';

import { createPacedLabelController, createExitLatchController } from './labelPacing';

/**
 * Deterministic timing tests: a manual clock (`now`) plus a manual timer queue
 * (`setTimer`/`clearTimer`) so we control exactly when a scheduled flush fires,
 * without relying on the environment's real timers.
 */
function fakeClock() {
  let t = 0;
  const pending: Array<{ id: number; at: number; fn: () => void }> = [];
  let nextId = 1;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.push({ id, at: t + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (h: ReturnType<typeof setTimeout>) => {
      const i = pending.findIndex((p) => p.id === (h as unknown as number));
      if (i >= 0) pending.splice(i, 1);
    },
    /** Advance the clock, firing any timers whose deadline is reached, in order. */
    advance: (ms: number) => {
      t += ms;
      pending
        .filter((p) => p.at <= t)
        .sort((a, b) => a.at - b.at)
        .forEach((p) => {
          const i = pending.indexOf(p);
          if (i >= 0) pending.splice(i, 1);
          p.fn();
        });
    },
  };
}

describe('createPacedLabelController', () => {
  it('shows the initial value immediately without a timer', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('erste', onChange, { minVisibleMs: 900, ...clk });
    expect(c.get()).toBe('erste');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('holds a label for at least minVisibleMs before swapping', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('a', onChange, { minVisibleMs: 900, ...clk });

    c.push('b');
    clk.advance(500); // not yet
    expect(c.get()).toBe('a');
    expect(onChange).not.toHaveBeenCalled();

    clk.advance(400); // 900ms total → swap
    expect(c.get()).toBe('b');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('collapses a burst to the latest value (drop-backlog-keep-latest)', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('a', onChange, { minVisibleMs: 900, ...clk });

    // Three sentences arrive well within one min-visible window.
    c.push('b');
    clk.advance(100);
    c.push('c');
    clk.advance(100);
    c.push('d');

    clk.advance(700); // 900ms since 'a' became visible → one swap, straight to 'd'
    expect(c.get()).toBe('d');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('d');
  });

  it('paces successive distinct labels one min-visible window apart', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('a', onChange, { minVisibleMs: 900, ...clk });

    c.push('b');
    clk.advance(900);
    expect(c.get()).toBe('b');

    c.push('c');
    clk.advance(400);
    expect(c.get()).toBe('b'); // 'b' still holding its window
    clk.advance(500);
    expect(c.get()).toBe('c');
    expect(onChange.mock.calls.map((c2: unknown[]) => c2[0])).toEqual(['b', 'c']);
  });

  it('ignores a push equal to the current value', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('a', onChange, { minVisibleMs: 900, ...clk });
    c.push('a');
    clk.advance(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dispose cancels a pending swap', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createPacedLabelController('a', onChange, { minVisibleMs: 900, ...clk });
    c.push('b');
    c.dispose();
    clk.advance(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(c.get()).toBe('a');
  });
});

describe('createExitLatchController', () => {
  it('stays mounted and fades out for exitMs after going inactive', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createExitLatchController(true, onChange, { exitMs: 250, ...clk });

    c.set(false);
    expect(onChange).toHaveBeenLastCalledWith({ mounted: true, exiting: true });

    clk.advance(250);
    expect(onChange).toHaveBeenLastCalledWith({ mounted: false, exiting: false });
  });

  it('cancels the exit when reactivated mid-fade', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createExitLatchController(true, onChange, { exitMs: 250, ...clk });

    c.set(false);
    clk.advance(100);
    c.set(true); // reactivate before the fade completes
    expect(onChange).toHaveBeenLastCalledWith({ mounted: true, exiting: false });

    clk.advance(500); // the original exit timer must not fire
    expect(onChange).toHaveBeenLastCalledWith({ mounted: true, exiting: false });
  });

  it('is a no-op when set inactive while already unmounted', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createExitLatchController(false, onChange, { exitMs: 250, ...clk });
    c.set(false);
    clk.advance(500);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dispose cancels a pending unmount', () => {
    const clk = fakeClock();
    const onChange = vi.fn();
    const c = createExitLatchController(true, onChange, { exitMs: 250, ...clk });
    c.set(false);
    c.dispose();
    clk.advance(500);
    // Only the initial exiting:true change fired; no unmount.
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ mounted: true, exiting: true });
  });
});
