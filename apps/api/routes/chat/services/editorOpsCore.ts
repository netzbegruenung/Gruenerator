/**
 * The three steps every editor edit shares: plan typed ops, summarize them, put
 * them on the wire.
 *
 * Two callers plan editor operations — the single-pass `edit_sheet` handler
 * (intentExecutionService) and the agentic loop's `edit_document` tool
 * (agents/editorTools). They arrived independently and ended up with the same
 * summary helper written out twice, the same failure/empty branches, and two
 * construction sites for one F0-frozen SSE event.
 *
 * They are NOT merged into a single "plan and emit" call, because their wire
 * order genuinely differs: the sheet handler streams its narration BEFORE the
 * operations event and needs the summary to write that narration, while the tool
 * emits the event first and reports back to the model afterwards. Sharing the
 * steps keeps both orders intact; sharing the whole choreography would have
 * silently reordered one of them.
 */

import { type EditorSurfaceKind } from './agenticLoop/routing.js';

import type { SSEWriter } from './sseHelpers.js';

/** A planned operation. Only the discriminator is common across surfaces. */
export interface EditorOp {
  type: string;
}

/** One-line summary of a planned op batch, e.g. "1× format_range". */
export function summarizeEditorOps(operations: EditorOp[]): string {
  const counts = new Map<string, number>();
  for (const op of operations) counts.set(op.type, (counts.get(op.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, n]) => `${n}× ${type}`).join(', ');
}

export type PlanEditorOpsOutcome<T extends EditorOp> =
  | { ok: true; operations: T[]; summary: string }
  | { ok: false; reason: 'planning_failed' | 'no_operations' };

/**
 * Run a surface's op planner and classify the outcome.
 *
 * Failure is contained here on purpose: no `editor_operations` is emitted, so
 * the artefact is never half-touched. The two callers phrase the outcome very
 * differently (a German fail text that ends the turn vs. an error object handed
 * back to the loop model), which is why this reports a reason instead of a
 * message.
 */
export async function planEditorOps<T extends EditorOp>(opts: {
  /** The caller's logger, so the service name in the log line stays theirs. */
  log: { error: (message: string) => void };
  /** Prefix identifying the caller, e.g. '[SheetEdit]' or '[EditorTool] sheet'. */
  logLabel: string;
  plan: () => Promise<T[]>;
}): Promise<PlanEditorOpsOutcome<T>> {
  let operations: T[];
  try {
    operations = await opts.plan();
  } catch (err) {
    opts.log.error(
      `${opts.logLabel} planning failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { ok: false, reason: 'planning_failed' };
  }

  if (operations.length === 0) return { ok: false, reason: 'no_operations' };
  return { ok: true, operations, summary: summarizeEditorOps(operations) };
}

/**
 * The single construction site for the `editor_operations` event.
 *
 * The client applies the ops in place (Univer / Yjs) via its per-surface
 * handler — the artefact lives in the browser, so apply is always client-side.
 */
export function emitEditorOperations(
  sse: SSEWriter,
  surface: EditorSurfaceKind,
  targetId: string,
  operations: EditorOp[],
  summary: string
): void {
  sse.send('editor_operations', { surface, targetId, operations, summary });
}
