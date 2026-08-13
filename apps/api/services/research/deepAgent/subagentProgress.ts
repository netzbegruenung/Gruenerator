/**
 * Turns the run's subagent projections into the steps the sidebar shows.
 *
 * Until now progress came from two places, and neither knew who was working:
 * `write_todos` (the lead's plan) and `ctx.onStep` inside the tools. While
 * delegation was serial that was enough — only one sub-question ran at a time,
 * so "Suche: Wehrpflicht" could only belong to it. Since #2546 several run at
 * once, and since #2550 they are two different kinds of researcher, so the tool
 * steps arrive interleaved with nothing saying which sub-question they serve.
 *
 * `streamEvents(..., { version: 'v3' })` exposes `run.subagents`: one handle per
 * delegation, carrying the subagent's `name`, the tool call that caused it, and
 * an `output` promise that settles when it finishes. That is exactly one step
 * per sub-question, with a start and an end.
 *
 * The sub-QUESTION is not on the handle — only `cause.tool_call_id` is. The text
 * lives in the `task` tool call's `description` argument, so both projections
 * are consumed and joined on that id. They can arrive in either order, which is
 * why a step is emitted as soon as EITHER half is known and re-emitted under the
 * same id when the other arrives: the panel merges by id, so the label sharpens
 * instead of a second step appearing.
 */

import { type ResearchStep } from './types.js';

/**
 * The subset of `ToolCallStream` this needs — stated so tests need no run.
 *
 * The three promises are not read for their values; they are listed because
 * every yielded call carries them LIVE and they must be silenced (see
 * `silencePromises`).
 */
export interface TaskCallLike {
  readonly name: string;
  readonly callId: string;
  readonly input: unknown;
  readonly output?: PromiseLike<unknown> | undefined;
  readonly status?: PromiseLike<unknown> | undefined;
  readonly error?: PromiseLike<unknown> | undefined;
}

/** The subset of `SubagentRunStream` this needs. */
export interface SubagentLike {
  readonly name: string;
  readonly cause?: { tool_call_id?: string } | undefined;
  readonly output: Promise<unknown>;
}

export interface SubagentProjections {
  readonly toolCalls: AsyncIterable<TaskCallLike>;
  readonly subagents: AsyncIterable<SubagentLike>;
}

/** The run's final-state promise. Present on every `streamEvents` run. */
export interface RunWithOutput {
  readonly output?: PromiseLike<unknown> | undefined;
}

/**
 * Observes the one projection nobody else does.
 *
 * `streamEvents` builds `run.output` eagerly, and on any abort it REJECTS —
 * whether or not anyone asked for it. The state loop catches its own error and
 * carries on into the wrap-up leg; `run.output` meanwhile rejects with no
 * handler attached, and Node kills the process on an unhandled rejection.
 *
 * Measured on 12.08.2026: a run hit its research deadline at 13 minutes, logged
 * `Lauf unterbrochen (deadline … Wrap-up)` as designed — and then died on
 * `DOMException [TimeoutError]` before it could write the report. In the API
 * that is a cluster worker gone, not just one report.
 *
 * `stream()` had no such promise, which is why this only appears with the v3
 * stream. Swallowing is right rather than sloppy: it is the SAME error the
 * values loop already threw and classified, so there is nothing here that is
 * not handled elsewhere.
 */
export function silenceRunOutput(run: RunWithOutput): void {
  silencePromises(run.output);
}

/**
 * Attaches a no-op catch to promises we hold but never read.
 *
 * Every `ToolCallStream` the `toolCalls` projection yields carries `output`,
 * `status` and `error` — live promises of the pregel task behind the call. We
 * only want the call's ARGUMENTS, but merely receiving the handle is enough:
 * when the run aborts, each in-flight task rejects, and a rejection nobody
 * holds ends the process.
 *
 * This is the second, harder half of the same bug as `silenceRunOutput`.
 * Silencing `run.output` alone looked like a fix on a 45-second probe, where
 * the deadline hits before any tool call is in flight — the full 13-minute run
 * died anyway, on a rejection carrying `pregelTaskId`. Short repros do not
 * reach this one.
 */
function silencePromises(...promises: (PromiseLike<unknown> | undefined)[]): void {
  for (const promise of promises) {
    if (promise) void Promise.resolve(promise).catch(() => {});
  }
}

/**
 * Display names. Unknown subagents fall through to their raw name rather than
 * being dropped — a name in the sidebar beats a missing step.
 */
const DISPLAY_NAMES: Record<string, string> = {
  'web-recherche': 'Web-Recherche',
  'programm-recherche': 'Programm-Recherche',
};

/** How much of a sub-question fits a sidebar row. */
const LABEL_CHARS = 90;

/**
 * Said out loud on a delegation the research clock cut short.
 *
 * The status stays `failed`, because the wire enum only knows running/done/
 * failed and it crosses to shipped mobile binaries — widening it for a
 * cosmetic distinction is not worth an additive rollout. So the LABEL carries
 * the difference instead. Measured on 12.08.2026: two of eight delegations
 * were still running when the deadline fired and showed up as bare ✗ rows,
 * which reads as "something broke" when in fact the report was written and
 * only these two sub-questions did not make it.
 */
export const CUT_SHORT_NOTE = 'Zeit abgelaufen';

/**
 * Whether a rejection is the run being stopped rather than the work failing.
 *
 * The names are the same two `classifyRunError` keys off in `resume.ts`, and
 * for the same reason: an abort surfaces under either one, and under Node the
 * timeout arrives as a `DOMException` rather than an `Error` — so this checks
 * the shape, not the class.
 */
function isAbort(reason: unknown): boolean {
  const name = (reason as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function subagentLabel(name: string, description?: string, note?: string): string {
  const who = DISPLAY_NAMES[name] ?? name;
  const suffix = note ? ` — ${note}` : '';
  if (!description) return `${who}${suffix}`;
  const oneLine = description.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return `${who}${suffix}`;
  const cut = oneLine.length > LABEL_CHARS ? `${oneLine.slice(0, LABEL_CHARS - 1)}…` : oneLine;
  return `${who}: ${cut}${suffix}`;
}

function taskDescription(input: unknown): string | undefined {
  const description = (input as { description?: unknown } | null)?.description;
  return typeof description === 'string' && description.length > 0 ? description : undefined;
}

/**
 * Consumes both projections and emits one step per delegation.
 *
 * Resolves when both iterables are exhausted — NOT when every subagent has
 * finished. The `output` promises are deliberately left to settle on their own:
 * awaiting them here would make cosmetic progress able to hang the run if one
 * never settles (an abort mid-delegation). The caller stops accepting steps
 * once the run is over, which is what keeps a late arrival harmless.
 */
export async function trackSubagents(
  run: SubagentProjections,
  emit: (step: ResearchStep) => void
): Promise<void> {
  const descriptions = new Map<string, string>();
  const steps = new Map<
    string,
    { id: string; name: string; status: ResearchStep['status']; note?: string }
  >();
  let anonymous = 0;

  const publish = (callId: string): void => {
    const step = steps.get(callId);
    if (!step) return;
    emit({
      id: step.id,
      label: subagentLabel(step.name, descriptions.get(callId), step.note),
      status: step.status,
    });
  };

  const settle = (callId: string, status: ResearchStep['status'], note?: string): void => {
    const step = steps.get(callId);
    if (!step) return;
    step.status = status;
    if (note) step.note = note;
    publish(callId);
  };

  const calls = (async () => {
    for await (const call of run.toolCalls) {
      // BEFORE the filter, deliberately: a call we skip still handed us its
      // live task promises, and an unsilenced one kills the process on abort.
      silencePromises(call.output, call.status, call.error);
      // Only `task` calls delegate. The researchers' own searches keep coming
      // through `ctx.onStep`, which is where their retry and budget wording is.
      if (call.name !== 'task') continue;
      const description = taskDescription(call.input);
      if (!description) continue;
      descriptions.set(call.callId, description);
      publish(call.callId);
    }
  })();

  const subagents = (async () => {
    for await (const sub of run.subagents) {
      // A handle without a cause cannot be joined to its question; it still gets
      // a step, under a synthetic id, so the sidebar shows that work is running.
      const callId = sub.cause?.tool_call_id ?? `ohne-aufruf-${(anonymous += 1)}`;
      steps.set(callId, { id: `sub-${callId}`, name: sub.name, status: 'running' });
      publish(callId);
      void sub.output.then(
        () => settle(callId, 'done'),
        (reason: unknown) => settle(callId, 'failed', isAbort(reason) ? CUT_SHORT_NOTE : undefined)
      );
    }
  })();

  await Promise.all([calls, subagents]);
}
