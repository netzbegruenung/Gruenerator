import { canvasAiOperationSchema, type CanvasAiOperation } from '@gruenerator/contracts';

import type { EditorOperationsEvent } from '@gruenerator/contracts';

/**
 * What one `editor_operations` event did to the open sharepic.
 *
 * Extracted from the studio sidebar's handler so the branching is testable
 * without React: the handler around it only maps this outcome onto the two
 * status-row states.
 */
export type CanvasEditorOpsOutcome =
  /** Another surface's or another canvas's event — not ours to apply. */
  | { status: 'ignored' }
  /** Every op failed re-validation; nothing was touched. */
  | { status: 'no_valid_ops' }
  | { status: 'applied'; operationCount: number };

export interface ApplyCanvasEditorOpsDeps {
  /** The canvas this sidebar is bound to (document id or draft key). */
  docKey: string;
  applyOperations: (ops: CanvasAiOperation[]) => void;
  /** Sets the Behalten/Verwerfen banner (null clears it). */
  setPending: (pending: { title: string } | null) => void;
}

/**
 * Apply one planned op batch to the open sharepic and raise the
 * Behalten/Verwerfen banner.
 *
 * The ops were planned server-side by the loop's `edit_document` tool
 * (runCanvasSuggest) and travel the wire as `unknown[]`, so each one is
 * re-validated here and a malformed op drops alone — same defence in depth the
 * boards surface applies.
 */
export function applyCanvasEditorOps(
  payload: EditorOperationsEvent,
  deps: ApplyCanvasEditorOpsDeps
): CanvasEditorOpsOutcome {
  if (payload.targetId !== deps.docKey || payload.surface !== 'canvas') {
    return { status: 'ignored' };
  }

  const ops: CanvasAiOperation[] = [];
  for (const raw of payload.operations) {
    const parsed = canvasAiOperationSchema.safeParse(raw);
    if (parsed.success) ops.push(parsed.data);
  }
  if (ops.length === 0) return { status: 'no_valid_ops' };

  // Auto-accept any prior pending suggestion so the new one isn't shadowed by
  // a stale banner.
  deps.setPending(null);
  deps.applyOperations(ops);
  deps.setPending({ title: payload.summary ?? 'KI-Bearbeitung' });
  return { status: 'applied', operationCount: ops.length };
}
