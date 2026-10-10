import { describe, expect, it } from 'vitest';

import { createRestartBudget } from './restartBudget';

describe('createRestartBudget', () => {
  it('allows max restarts within the window, then refuses', () => {
    let t = 0;
    const tryRestart = createRestartBudget(3, 60_000, () => t);
    expect([tryRestart(), tryRestart(), tryRestart(), tryRestart()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('recovers once old restarts leave the window', () => {
    let t = 0;
    const tryRestart = createRestartBudget(1, 1000, () => t);
    expect(tryRestart()).toBe(true);
    expect(tryRestart()).toBe(false);
    t = 1000;
    expect(tryRestart()).toBe(true);
  });
});
