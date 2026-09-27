/**
 * Lets a run survive its runtime dying, not just its model misbehaving.
 *
 * The middleware repairs bad turns INSIDE a healthy loop; this module handles
 * the loop itself failing: a model call that exhausts its six client-side
 * retries during a provider outage, a 400 shape the sanitizer does not know,
 * or the recursion limit. Before this, any such error forfeited everything the
 * run had already paid for — searches, crawls, subagent reports — unless
 * `/bericht.md` happened to exist already.
 *
 * The stream runs `streamMode: 'values'`, so the caller always holds the last
 * full state. Resuming is therefore re-invoking the agent WITH that state —
 * no checkpointer involved. Two details are load-bearing:
 *
 * - A run that dies mid-tool leaves the last AI message with tool calls that
 *   have no ToolMessage answering them. Re-sent as-is, the API rejects the
 *   whole history (same failure class as the poisoned tool names). Every
 *   dangling call gets a synthetic ToolMessage saying it was interrupted, which
 *   both fixes the wire shape and tells the model to redo it.
 * - The recursion limit is a budget, not a transient fault, so it is not
 *   resumed with another full allowance. It gets ONE short wrap-up leg whose
 *   instruction is to write the report from what is already there.
 */

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { GraphRecursionError } from '@langchain/langgraph';

/**
 * How often a run may be resumed after a transient runtime error.
 *
 * Three rather than two: with the wall-clock budget at a quarter of an hour, a
 * continuation no longer competes with the report for the same minutes.
 */
export const RESUME_LIMIT = 3;

/** Steps the wrap-up leg gets — enough for write_file plus a closing answer. */
export const WRAP_UP_RECURSION_LIMIT = 12;

export const INTERRUPTED_CALL_TEXT =
  'Dieser Werkzeugaufruf wurde durch eine Störung unterbrochen und nicht ausgeführt. Wiederhole ihn, falls sein Ergebnis noch fehlt.';

/**
 * The opening turn of a CONTINUED run.
 *
 * A resume re-enters the same `thread_id`, so the checkpointer hands the agent
 * its own history back. Sending the original question again would read as a
 * second, identical order — the model would re-plan and re-delegate work that
 * is already paid for. This says what actually happened instead.
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
 * wrap-up leg as `recursion`. Only the CALLER's signal ends a run outright.
 */
export type RunErrorKind = 'fatal' | 'transient' | 'recursion' | 'deadline';

/** Guards against a cause chain that loops back on itself. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The error plus everything it was wrapped around.
 *
 * A re-thrown error hides its kind behind the wrapper: neither `instanceof` nor
 * the name matches at the surface, so both checks have to run per link.
 */
function errorChain(error: unknown): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;
  while (current instanceof Error && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * Decides whether an error that killed the stream is worth a resume.
 *
 * The signals are checked first, and in this order, because an abort surfaces
 * under several names (`AbortError`, `TimeoutError`, or wrapped) — the flag on
 * the signal is the one source that does not depend on who wrapped the error.
 * The caller's signal wins over our own research deadline: when both have
 * fired there is no time left to wrap anything up.
 *
 * The recursion check runs over the cause chain and accepts either the class or
 * the name. Missing it is not a crash but a silent downgrade to `transient`:
 * the run would spend two full continuations where one 12-step wrap-up leg was
 * meant to do it. `instanceof` alone is not enough either — the error may have
 * crossed a package boundary with its own copy of the class.
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
  if (
    errorChain(error).some(
      (e) => e instanceof GraphRecursionError || e.name === 'GraphRecursionError'
    )
  ) {
    return 'recursion';
  }
  return 'transient';
}

interface MessageLike {
  getType?: () => string;
}

function collectAnsweredIds(messages: unknown[]): Set<string> {
  const answered = new Set<string>();
  for (const msg of messages) {
    if (msg instanceof ToolMessage && msg.tool_call_id) answered.add(msg.tool_call_id);
  }
  return answered;
}

/**
 * Builds the input for the next attempt from the state the dead stream left.
 *
 * Returns null when there is nothing to resume from — the very first model
 * call died before any state was emitted — in which case the caller starts
 * over with the original question.
 */
export function buildResumeInput(
  state: Record<string, unknown> | null,
  kind: Exclude<RunErrorKind, 'fatal'>
): Record<string, unknown> | null {
  const messages = (state?.messages ?? []) as (MessageLike | AIMessage)[];
  if (messages.length === 0) return null;

  const answered = collectAnsweredIds(messages);
  const repaired: unknown[] = [...messages];
  for (const msg of messages) {
    if (!(msg instanceof AIMessage)) continue;
    for (const call of msg.tool_calls ?? []) {
      if (!call.id || answered.has(call.id)) continue;
      repaired.push(
        new ToolMessage({
          content: INTERRUPTED_CALL_TEXT,
          tool_call_id: call.id,
          name: call.name,
        })
      );
    }
  }

  if (kind === 'recursion') repaired.push(new HumanMessage(WRAP_UP_TEXT));
  if (kind === 'deadline') repaired.push(new HumanMessage(DEADLINE_TEXT));

  return {
    messages: repaired,
    ...(state?.files !== undefined ? { files: state.files } : {}),
    ...(state?.todos !== undefined ? { todos: state.todos } : {}),
  };
}
