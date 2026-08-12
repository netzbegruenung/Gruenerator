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

/** The subset of `ToolCallStream` this needs — stated so tests need no run. */
export interface TaskCallLike {
  readonly name: string;
  readonly callId: string;
  readonly input: unknown;
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

export function subagentLabel(name: string, description?: string): string {
  const who = DISPLAY_NAMES[name] ?? name;
  if (!description) return who;
  const oneLine = description.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return who;
  const cut = oneLine.length > LABEL_CHARS ? `${oneLine.slice(0, LABEL_CHARS - 1)}…` : oneLine;
  return `${who}: ${cut}`;
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
  const steps = new Map<string, { id: string; name: string; status: ResearchStep['status'] }>();
  let anonymous = 0;

  const publish = (callId: string): void => {
    const step = steps.get(callId);
    if (!step) return;
    emit({
      id: step.id,
      label: subagentLabel(step.name, descriptions.get(callId)),
      status: step.status,
    });
  };

  const settle = (callId: string, status: ResearchStep['status']): void => {
    const step = steps.get(callId);
    if (!step) return;
    step.status = status;
    publish(callId);
  };

  const calls = (async () => {
    for await (const call of run.toolCalls) {
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
        () => settle(callId, 'failed')
      );
    }
  })();

  await Promise.all([calls, subagents]);
}
