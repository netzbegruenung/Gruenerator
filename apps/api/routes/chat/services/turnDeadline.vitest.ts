import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createTurnClocks } from './agenticLoop/loopBudget.js';
import { DEFAULT_LOOP_BUDGET } from './agenticLoop/types.js';
import { createTurnDeadline, TURN_CEILING_MS } from './turnDeadline.js';

const warn = vi.fn<(m: string) => void>();
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: (m: string): void => warn(m),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/**
 * Der Zug hat EINE Frist, und sie ist keine Summe.
 *
 * Anlass war ein Eval-Zug über 1.229.798 ms (18.08.2026) — nachträglich als
 * Schlaf des Messrechners entlarvt, siehe turnDeadline.ts. Die Lücke, die er
 * sichtbar machte, ist trotzdem echt: Klassifikator, Suche und Antwort brachten
 * je eigene, voneinander unabhängige Fristen mit, ihre SUMME deckelte niemand.
 *
 * Diese Tests halten beides fest: die Decke feuert an ihrer eigenen Zahl (nicht
 * an der Summe der Phasen-Decken), sie sagt es ins Log, und beide Uhren des
 * Loops hängen an ihr.
 */
describe('turn deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warn.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bricht an der Decke ab — nicht erst nach der Summe der Phasen-Decken', () => {
    const { signal } = createTurnDeadline('req_test');

    // Nach einer vollen Phasen-Decke (hardCapMs) lebt der Zug noch: die
    // Turn-Decke ist eine EIGENE Zahl, nicht die erste Phasenfrist.
    vi.advanceTimersByTime(DEFAULT_LOOP_BUDGET.hardCapMs);
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(TURN_CEILING_MS - DEFAULT_LOOP_BUDGET.hardCapMs);
    expect(signal.aborted).toBe(true);

    // Die Summe der Phasen-Decken (Werkzeug + Schreiben = 2 × hardCapMs) liegt
    // über der Decke — genau der Fall, den sie kappt.
    expect(TURN_CEILING_MS).toBeLessThan(DEFAULT_LOOP_BUDGET.hardCapMs * 2);
  });

  it('schweigt nicht: das Reissen der Decke steht im Log', () => {
    createTurnDeadline('req_laut');
    vi.advanceTimersByTime(TURN_CEILING_MS);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('turn ceiling');
    expect(warn.mock.calls[0]?.[0]).toContain('req_laut');
  });

  it('feuert nach clear() nicht mehr — ein fertiger Zug bricht nichts ab', () => {
    const { signal, clear } = createTurnDeadline('req_fertig');
    clear();

    vi.advanceTimersByTime(TURN_CEILING_MS * 2);
    expect(signal.aborted).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('deckelt BEIDE Uhren des Loops — Werkzeugphase und Schreibphase', () => {
    const { signal } = createTurnDeadline('req_beide');
    const clocks = createTurnClocks(DEFAULT_LOOP_BUDGET, signal);

    vi.advanceTimersByTime(TURN_CEILING_MS);

    expect(clocks.abortSignal.aborted).toBe(true);
    expect(clocks.writeAbortSignal.aborted).toBe(true);
  });
});
