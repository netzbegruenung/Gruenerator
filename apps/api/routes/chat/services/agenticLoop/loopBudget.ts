/**
 * Zeit- und Schrittbudget eines agentischen Turns — und die Uhren, die daraus
 * hängen: die Werkzeugphase läuft gegen ein WEICHES Budget (es entzieht die
 * Werkzeuge), nur die absolute Decke bricht ab. Wer eine davon einzeln
 * verstellt, verschiebt still diese Reihenfolge.
 */
import { DEFAULT_LOOP_BUDGET, type LoopBudget } from './types.js';

export function resolveBudget(): LoopBudget {
  const maxSteps = Number(process.env.CHAT_AGENT_LOOP_MAX_STEPS) || DEFAULT_LOOP_BUDGET.maxSteps;
  const wallClockMs =
    Number(process.env.CHAT_AGENT_LOOP_BUDGET_MS) || DEFAULT_LOOP_BUDGET.wallClockMs;
  // The ceiling must stay above the tool budget, or raising the latter via env
  // would put the hard abort BACK inside the tool phase.
  const hardCapMs = Math.max(DEFAULT_LOOP_BUDGET.hardCapMs, wallClockMs * 2);
  return { ...DEFAULT_LOOP_BUDGET, maxSteps, wallClockMs, hardCapMs };
}

export interface TurnClocks {
  /** Absolute ceiling for the tool phase. A hang guard, not a pace. */
  abortSignal: AbortSignal;
  /** Wall-clock moment at which the SOFT tool budget is spent. */
  toolBudgetDeadline: number;
}

/**
 * The turn budget is SOFT: it strips the tools via `forceFinish` instead of
 * aborting the stream. Only the absolute ceiling aborts; it starts HERE, so a
 * slow tool phase is billed to the sentence after it. What protects the answer
 * is the soft budget ending the tool work early (#5365).
 */
export function createTurnClocks(
  budget: LoopBudget,
  reqSignal?: AbortSignal,
  /** Freigabe-Gate: sonst schreibt der Reparatur-Schreiber noch eine Antwort,
   *  während wir auf die Freigabe warten. */
  suspendSignal?: AbortSignal
): TurnClocks {
  const extra = [reqSignal, suspendSignal].filter((s): s is AbortSignal => s != null);
  const withRequest = (signal: AbortSignal): AbortSignal =>
    extra.length > 0 ? AbortSignal.any([...extra, signal]) : signal;
  return {
    abortSignal: withRequest(AbortSignal.timeout(budget.hardCapMs)),
    toolBudgetDeadline: Date.now() + budget.wallClockMs,
  };
}
