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

import { applyCanvasEditorOps, describeCanvasEditorOpsOutcome } from './applyCanvasEditorOps';

import type { ApplyResult } from '@gruenerator/canvas-editor';
import type { CanvasAiOperation, EditorOperationsEvent } from '@gruenerator/contracts';

const SET_TEXT = {
  kind: 'set-text',
  field: 'quote',
  label: 'Zitat',
  value: 'Mehr Tempo.',
} as const;

function deps(results?: (ops: CanvasAiOperation[]) => ApplyResult[]) {
  return {
    docKey: 'canvas-1',
    applyOperations: vi.fn<(ops: CanvasAiOperation[]) => ApplyResult[]>(
      results ?? ((ops) => ops.map(() => ({ ok: true })))
    ),
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

    expect(outcome).toEqual({ status: 'applied', applied: 1, failed: [] });
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
    expect(outcome).toEqual({ status: 'applied', applied: 2, failed: [] });
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

  it('reports the ops the applier rejected and still raises the banner', () => {
    const d = deps(() => [
      { ok: true },
      { ok: false, reason: 'no font-size setter for field "quote" in this template' },
      { ok: true },
    ]);
    const outcome = applyCanvasEditorOps(
      event({
        operations: [
          SET_TEXT,
          { kind: 'set-font-size', field: 'quote', label: 'Zitat', size: 80 },
          { kind: 'set-color-mode', mode: 'dark' },
        ],
      }),
      d
    );

    expect(outcome).toEqual({
      status: 'applied',
      applied: 2,
      failed: [
        {
          kind: 'set-font-size',
          reason: 'no font-size setter for field "quote" in this template',
        },
      ],
    });
    expect(d.setPending).toHaveBeenLastCalledWith({ title: 'Zitat geschärft' });
  });

  it('raises no banner when the applier rejected every op', () => {
    const d = deps(() => [
      { ok: false, reason: 'no setter for text field "quote" in this template' },
    ]);
    const outcome = applyCanvasEditorOps(event(), d);

    expect(outcome).toEqual({
      status: 'nothing_applied',
      failed: [{ kind: 'set-text', reason: 'no setter for text field "quote" in this template' }],
    });
    expect(d.applyOperations).toHaveBeenCalledWith([SET_TEXT]);
    // Only the stale-banner clear — nothing changed, so nothing to keep or discard.
    expect(d.setPending.mock.calls).toEqual([[null]]);
  });
});

describe('describeCanvasEditorOpsOutcome', () => {
  it('says nothing when every op landed', () => {
    expect(
      describeCanvasEditorOpsOutcome({ status: 'applied', applied: 3, failed: [] })
    ).toBeNull();
    expect(describeCanvasEditorOpsOutcome({ status: 'ignored' })).toBeNull();
  });

  it('counts a partial batch and says in German what could not be done', () => {
    const text = describeCanvasEditorOpsOutcome({
      status: 'applied',
      applied: 2,
      failed: [
        {
          kind: 'set-font-size',
          reason: 'no font-size setter for field "quote" in this template',
        },
      ],
    });
    expect(text).toBe('2 von 3 Änderungen angewendet – Schriftgröße lässt sich hier nicht ändern');
    // The applier's English reason is for the console, never the UI.
    expect(text).not.toContain('setter');
  });

  it('names each failed kind once when nothing could be applied', () => {
    expect(
      describeCanvasEditorOpsOutcome({
        status: 'nothing_applied',
        failed: [
          { kind: 'set-text', reason: 'no setter for text field "a" in this template' },
          { kind: 'set-text', reason: 'no setter for text field "b" in this template' },
          { kind: 'set-background-color', reason: 'template does not support background color' },
        ],
      })
    ).toBe(
      'Die Änderung ließ sich nicht anwenden: Text lässt sich hier nicht ändern; Hintergrundfarbe lässt sich hier nicht ändern'
    );
  });

  it('keeps the message for a batch without a single valid op', () => {
    expect(describeCanvasEditorOpsOutcome({ status: 'no_valid_ops' })).toBe(
      'Keine passende Bearbeitung erkannt.'
    );
  });
});
