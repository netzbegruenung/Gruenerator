/**
 * applyCanvasEditorOps — the studio sidebar's executor for the loop's planned
 * sharepic ops (edit_document tool → editor_operations SSE → here).
 *
 * The three branches that matter live here rather than in the React handler:
 * an event for another target/surface must be left alone (several editor
 * sidebars register against the same store), ops arrive as `unknown[]` and are
 * re-validated one by one, and an all-invalid batch must NOT raise the
 * Behalten/Verwerfen banner over a canvas nothing changed on.
 */
import { describe, expect, it, vi } from 'vitest';

import { applyCanvasEditorOps } from './applyCanvasEditorOps';

import type { CanvasAiOperation, EditorOperationsEvent } from '@gruenerator/contracts';

const SET_TEXT = {
  kind: 'set-text',
  field: 'quote',
  label: 'Zitat',
  value: 'Mehr Tempo.',
} as const;

function deps() {
  return {
    docKey: 'canvas-1',
    applyOperations: vi.fn<(ops: CanvasAiOperation[]) => void>(),
    setPending: vi.fn<(pending: { title: string } | null) => void>(),
  };
}

function event(overrides?: Partial<EditorOperationsEvent>): EditorOperationsEvent {
  return {
    surface: 'canvas',
    targetId: 'canvas-1',
    operations: [SET_TEXT],
    summary: 'Zitat geschärft',
    ...overrides,
  };
}

describe('applyCanvasEditorOps', () => {
  it('applies the ops and raises the banner with the planner summary', () => {
    const d = deps();
    const outcome = applyCanvasEditorOps(event(), d);

    expect(outcome).toEqual({ status: 'applied', operationCount: 1 });
    expect(d.applyOperations).toHaveBeenCalledWith([SET_TEXT]);
    // A stale banner is cleared first, so the new suggestion isn't shadowed.
    expect(d.setPending.mock.calls).toEqual([[null], [{ title: 'Zitat geschärft' }]]);
  });

  it('falls back to a generic banner title when the event carries no summary', () => {
    const d = deps();
    const { summary: _summary, ...withoutSummary } = event();
    applyCanvasEditorOps(withoutSummary, d);

    expect(d.setPending).toHaveBeenLastCalledWith({ title: 'KI-Bearbeitung' });
  });

  it('ignores an event for another target or another surface', () => {
    const d = deps();
    expect(applyCanvasEditorOps(event({ targetId: 'canvas-2' }), d)).toEqual({ status: 'ignored' });
    expect(applyCanvasEditorOps(event({ surface: 'sheet' }), d)).toEqual({ status: 'ignored' });
    expect(d.applyOperations).not.toHaveBeenCalled();
    expect(d.setPending).not.toHaveBeenCalled();
  });

  it('drops one malformed op alone and applies the rest', () => {
    const d = deps();
    const outcome = applyCanvasEditorOps(
      event({
        operations: [
          SET_TEXT,
          { kind: 'set-color-scheme' },
          { kind: 'set-color-mode', mode: 'dark' },
        ],
      }),
      d
    );

    // set-color-scheme without a schemeId fails its schema; the other two survive.
    expect(outcome).toEqual({ status: 'applied', operationCount: 2 });
    expect(d.applyOperations).toHaveBeenCalledWith([
      SET_TEXT,
      { kind: 'set-color-mode', mode: 'dark' },
    ]);
  });

  it('reports no_valid_ops and leaves the canvas and the banner untouched', () => {
    const d = deps();
    const outcome = applyCanvasEditorOps(
      event({ operations: [{ kind: 'nicht-existent' }, 'kaputt'] }),
      d
    );

    expect(outcome).toEqual({ status: 'no_valid_ops' });
    expect(d.applyOperations).not.toHaveBeenCalled();
    expect(d.setPending).not.toHaveBeenCalled();
  });
});
