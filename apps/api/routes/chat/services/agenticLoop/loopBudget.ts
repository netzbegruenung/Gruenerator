/**
 * Zeit- und Schrittbudget eines agentischen Turns — und die drei Uhren, die
 * daraus hängen.
 *
 * Zusammen in einer Datei, weil ihre Verhältnisse zueinander die eigentliche
 * Aussage sind: die Werkzeugphase läuft gegen ein WEICHES Budget (es entzieht
 * die Werkzeuge), die absolute Decke bricht ab, und die Schreibphase bekommt
 * eine EIGENE Decke. Wer eine davon einzeln verstellt, verschiebt still die
 * Reihenfolge, die dieser Aufbau gerade verhindern soll.
 */
import { DEFAULT_LOOP_BUDGET, type LoopBudget } from './types.js';

export function resolveBudget(): LoopBudget {
  const maxSteps = Number(process.env.CHAT_AGENT_LOOP_MAX_STEPS) || DEFAULT_LOOP_BUDGET.maxSteps;
  const wallClockMs =
    Number(process.env.CHAT_AGENT_LOOP_BUDGET_MS) || DEFAULT_LOOP_BUDGET.wallClockMs;
  // The ceiling must stay above the tool budget, or raising the latter via env
  // would put the hard abort BACK inside the tool phase — the very ordering
  // this split exists to prevent.
  const hardCapMs = Math.max(DEFAULT_LOOP_BUDGET.hardCapMs, wallClockMs * 2);
  return { ...DEFAULT_LOOP_BUDGET, maxSteps, wallClockMs, hardCapMs };
}

export interface TurnClocks {
  /** Absolute ceiling for the tool phase. A hang guard, not a pace. */
  abortSignal: AbortSignal;
  /** Split mode's writer runs under its own signal — but with the same start
   *  and length as `abortSignal`, see `createTurnClocks`. */
  writeAbortSignal: AbortSignal;
  /** Wall-clock moment at which the SOFT tool budget is spent. */
  toolBudgetDeadline: number;
}

/**
 * The turn budget is SOFT: it strips the tools via `forceFinish` instead of
 * aborting the stream. Only the absolute ceiling aborts.
 *
 * Both ceilings start HERE, at the turn's start, and run equally long: the split
 * writer's signal is a second timer, not a fresh one. A slow tool phase is billed
 * to the sentence after it in both modes; what protects the answer is the soft
 * budget ending the tool work early. A truly fresh writer ceiling would only move
 * the cut to the turn ceiling (`TURN_CEILING_MS`), see #5365.
 */
export function createTurnClocks(
  budget: LoopBudget,
  reqSignal?: AbortSignal,
  /** Freigabe-Gate. MUSS auch in `writeAbortSignal`: sonst schreibt die Synthese
   *  des geteilten Modus noch eine Antwort, während wir auf die Freigabe warten. */
  suspendSignal?: AbortSignal
): TurnClocks {
  const extra = [reqSignal, suspendSignal].filter((s): s is AbortSignal => s != null);
  const withRequest = (signal: AbortSignal): AbortSignal =>
    extra.length > 0 ? AbortSignal.any([...extra, signal]) : signal;
  return {
    abortSignal: withRequest(AbortSignal.timeout(budget.hardCapMs)),
    writeAbortSignal: withRequest(AbortSignal.timeout(budget.hardCapMs)),
    toolBudgetDeadline: Date.now() + budget.wallClockMs,
  };
}
