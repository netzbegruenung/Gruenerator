import {
  canvasAiOperationSchema,
  type CanvasAiOperationKind,
  type CanvasAiOperation,
  type EditorOperationsEvent,
} from '@gruenerator/contracts';

import type { ApplyResult } from '@gruenerator/canvas-editor';

/**
 * What one `editor_operations` event did to the open sharepic.
 *
 * Extracted from the studio sidebar's handler so the branching is testable
 * without React: the handler around it only maps this outcome onto the
 * status row.
 */
export interface CanvasEditorOpFailure {
  kind: CanvasAiOperationKind;
  reason: string;
}

export type CanvasEditorOpsOutcome =
  /** Another surface's or another canvas's event — not ours to apply. */
  | { status: 'ignored' }
  /** Every op failed re-validation; nothing was touched. */
  | { status: 'no_valid_ops' }
  /** The applier rejected every op; the canvas is unchanged, no banner. */
  | { status: 'nothing_applied'; failed: CanvasEditorOpFailure[] }
  | { status: 'applied'; applied: number; failed: CanvasEditorOpFailure[] };

export interface ApplyCanvasEditorOpsDeps {
  /** The canvas this sidebar is bound to (document id or draft key). */
  docKey: string;
  /** One result per op, in order (CanvasAiEditBridge.applyOperations). */
  applyOperations: (ops: CanvasAiOperation[]) => ApplyResult[];
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
  const results = deps.applyOperations(ops);
  const failed: CanvasEditorOpFailure[] = [];
  results.forEach((result, i) => {
    if (!result.ok) failed.push({ kind: ops[i].kind, reason: result.reason });
  });
  const applied = ops.length - failed.length;
  // Nothing changed — a Behalten/Verwerfen banner would offer to undo nothing.
  if (applied === 0) return { status: 'nothing_applied', failed };
  deps.setPending({ title: payload.summary ?? 'KI-Bearbeitung' });
  return { status: 'applied', applied, failed };
}

/** The status-row text for an outcome; null when there is nothing to report. */
export function describeCanvasEditorOpsOutcome(outcome: CanvasEditorOpsOutcome): string | null {
  switch (outcome.status) {
    case 'ignored':
      return null;
    case 'no_valid_ops':
      return 'Keine passende Bearbeitung erkannt.';
    case 'nothing_applied':
      return `Die Änderung ließ sich nicht anwenden: ${reasonsOf(outcome.failed)}`;
    case 'applied':
      if (outcome.failed.length === 0) return null;
      return `${outcome.applied} von ${outcome.applied + outcome.failed.length} Änderungen angewendet – ${reasonsOf(outcome.failed)}`;
  }
}

const reasonsOf = (failed: CanvasEditorOpFailure[]): string =>
  [...new Set(failed.map((f) => f.reason))].join('; ');
