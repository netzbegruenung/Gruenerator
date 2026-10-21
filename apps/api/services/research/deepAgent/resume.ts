/**
 * Lets a run survive its runtime dying, not just its model misbehaving.
 *
 * `sanitizeToolCalls` and `nudgeMissingReport` repair bad turns INSIDE a
 * healthy loop; this module handles the loop itself failing: a model call that
 * exhausts its client-side retries during a provider outage, a 400 shape the
 * sanitizer does not know, or the step budget. Before this, any such error
 * forfeited everything the run had already paid for — searches, crawls,
 * subagent reports — unless `/bericht.md` happened to exist already.
 *
 * The run keeps its history step by step (`onStepFinish`), so resuming is
 * calling the model again WITH that history. A step is only recorded once its
 * tools have answered, so the history never ends in a tool call without a
 * result — the dangling-call repair the LangGraph version needed is gone with
 * the mid-step state it repaired.
 *
 * The step budget is a budget, not a transient fault, so it is not resumed with
 * another full allowance. It gets ONE short wrap-up leg whose instruction is to
 * write the report from what is already there.
 */

import { type ModelMessage } from 'ai';

/**
 * How often a run may be resumed after a transient runtime error.
 *
 * Three rather than two: with the wall-clock budget at a quarter of an hour, a
 * continuation no longer competes with the report for the same minutes.
 */
export const RESUME_LIMIT = 3;

/** Steps the wrap-up leg gets — enough for write_file plus a closing answer. */
export const WRAP_UP_STEPS = 6;

/**
 * The opening turn of a CONTINUED run.
 *
 * A run picked up after a restart gets its own history back. Sending the
 * original question again would read as a second, identical order — the model
 * would re-plan and re-delegate work that is already paid for. This says what
 * actually happened instead.
 */
export const RESUMED_RUN_TEXT =
  'Dieser Lauf wurde durch einen Neustart unterbrochen und wird jetzt fortgesetzt. Fang NICHT ' +
  'von vorne an: sieh dir an, was du bereits herausgefunden hast, hole nur noch das Fehlende ' +
  'nach und schreibe dann den Bericht nach /bericht.md.';

export const WRAP_UP_TEXT =
  'Das Schrittbudget ist erschöpft. Recherchiere nichts mehr: schreibe JETZT mit write_file ' +
  'den Bericht nach /bericht.md aus dem vorhandenen Material und antworte dann mit zwei bis drei Sätzen.';

export const DEADLINE_TEXT =
  'Die Zeit für die Recherche ist abgelaufen. Recherchiere nichts mehr und rufe keine Suchwerkzeuge ' +
  'mehr auf: schreibe JETZT mit write_file den Bericht nach /bericht.md aus dem vorhandenen Material — ' +
  'lückenhafte Abschnitte kennzeichnest du im Text — und antworte dann mit zwei bis drei Sätzen.';

/**
 * `deadline` is our own research clock running out, and it is NOT fatal: the
 * material is in hand and only the writing is missing, so it earns the same
 * wrap-up leg as `steps`. Only the CALLER's signal ends a run outright.
 */
export type RunErrorKind = 'fatal' | 'transient' | 'deadline';

/**
 * Decides whether an error that killed the loop is worth a resume.
 *
 * The signals are checked first, and in this order, because an abort surfaces
 * under several names (`AbortError`, `TimeoutError`, or wrapped) — the flag on
 * the signal is the one source that does not depend on who wrapped the error.
 * The caller's signal wins over our own research deadline: when both have
 * fired there is no time left to wrap anything up.
 */
export function classifyRunError(
  error: unknown,
  signal?: AbortSignal,
  researchDeadline?: AbortSignal
): RunErrorKind {
  if (signal?.aborted) return 'fatal';
  if (researchDeadline?.aborted) return 'deadline';
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || name === 'TimeoutError') return 'fatal';
  return 'transient';
}

/** What the next leg is told, appended to the history it continues from. */
export function resumeMessages(
  history: ModelMessage[],
  reason: 'transient' | 'steps' | 'deadline' | 'restart'
): ModelMessage[] {
  if (reason === 'steps') return [...history, { role: 'user', content: WRAP_UP_TEXT }];
  if (reason === 'deadline') return [...history, { role: 'user', content: DEADLINE_TEXT }];
  if (reason === 'restart') return [...history, { role: 'user', content: RESUMED_RUN_TEXT }];
  return history;
}
