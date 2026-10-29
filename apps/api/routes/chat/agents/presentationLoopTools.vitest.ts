import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const mocks = vi.hoisted(() => ({
  loadPresentationState: vi.fn<(...a: unknown[]) => unknown>(),
  planAndApplyPresentationEdit: vi.fn<(...a: unknown[]) => unknown>(),
  canvasAccessible: vi.fn<(...a: unknown[]) => unknown>(),
  loadCanvasAsContext: vi.fn<(...a: unknown[]) => unknown>(),
  planAndApplyCanvasDeckEdit: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../../../services/canvas/canvasContext.js', () => ({
  canvasAccessible: (...a: unknown[]) => mocks.canvasAccessible(...a),
  loadCanvasAsContext: (...a: unknown[]) => mocks.loadCanvasAsContext(...a),
}));

vi.mock('../../../services/presentations/PresentationGenerationService.js', () => ({
  loadPresentationState: (...a: unknown[]) => mocks.loadPresentationState(...a),
  formatPresentationAsContext: () => 'Folie 1: Start',
}));
vi.mock('../../../services/presentations/canvasDeckEdit.js', () => ({
  planAndApplyCanvasDeckEdit: (...a: unknown[]) => mocks.planAndApplyCanvasDeckEdit(...a),
}));
const confirm = vi.hoisted(() => ({
  emitToolConfirmAction: vi.fn<(...a: unknown[]) => unknown>(),
}));
vi.mock('../services/confirmActionService.js', () => ({
  emitToolConfirmAction: (...a: unknown[]) => confirm.emitToolConfirmAction(...a),
  newActionId: () => 'act1',
}));
const sse = { send: vi.fn() };
vi.mock('../services/presentationEditCore.js', () => ({
  planAndApplyPresentationEdit: (...a: unknown[]) => mocks.planAndApplyPresentationEdit(...a),
}));

const { makeEditPresentationTool, makeReadPresentationTool } =
  await import('./presentationLoopTools.js');

const stateWith = (lastUser = 'ja', over: Record<string, unknown> = {}) =>
  ({
    agentConfig: { userId: 'u1' },
    threadArtifacts: [{ kind: 'presentation', ref: 'p1' }],
    messages: [{ role: 'user', content: lastUser }],
    ...over,
  }) as unknown as ChatGraphState;

const run = (t: unknown, input: unknown) =>
  (t as { execute: (i: unknown, o?: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    {}
  );

const edit = (state: ChatGraphState) =>
  makeEditPresentationTool({ state, threadId: 't1', sse: sse as never });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe('read_presentation', () => {
  it('returns the slides as text', async () => {
    mocks.loadPresentationState.mockResolvedValue({ slides: [{}, {}] });
    const out = await run(
      makeReadPresentationTool({ state: stateWith(), threadId: 't1', sse: sse as never }),
      {}
    );
    expect(out).toMatchObject({ presentationId: 'p1', slideCount: 2, inhalt: 'Folie 1: Start' });
  });

  it('reads a canvas deck through the canvas reader', async () => {
    mocks.loadPresentationState.mockResolvedValue(null);
    mocks.loadCanvasAsContext.mockResolvedValue('# Deck\n\n## Folie 1\nA\n\n## Folie 2\nB');
    const out = await run(
      makeReadPresentationTool({ state: stateWith(), threadId: 't1', sse: sse as never }),
      {}
    );
    expect(out).toMatchObject({ presentationId: 'p1', slideCount: 2 });
    expect(out.inhalt).toContain('## Folie 2');
  });

  it('errors without a presentation in the thread', async () => {
    const state = stateWith('ja', { threadArtifacts: [] });
    const out = await run(
      makeReadPresentationTool({ state, threadId: 't1', sse: sse as never }),
      {}
    );
    expect(out.error).toBeDefined();
  });
});

describe('edit_presentation', () => {
  it('edits a canvas deck through the canvas deck editor', async () => {
    mocks.canvasAccessible.mockResolvedValue(true);
    mocks.planAndApplyCanvasDeckEdit.mockResolvedValue({
      status: 'applied',
      title: 'Klimaplan',
      summary: 'Folie 3: set-text folie-spalte-1',
      applied: 1,
      skipped: [],
    });
    const out = await run(edit(stateWith('Mach Folie 3 kürzer')), {
      anweisung: 'Folie 3 kürzer',
      confirm: false,
    });
    expect(out).toMatchObject({ ok: true, presentationId: 'p1', operationCount: 1 });
    expect(mocks.planAndApplyCanvasDeckEdit).toHaveBeenCalledWith({
      canvasId: 'p1',
      userId: 'u1',
      instruction: 'Folie 3 kürzer',
      destructiveAllowed: false,
    });
    expect(mocks.planAndApplyPresentationEdit).not.toHaveBeenCalled();
  });

  it('shows a confirmation card when a canvas deck loses slides and writes nothing', async () => {
    mocks.canvasAccessible.mockResolvedValue(true);
    const operations = [{ kind: 'remove-slide', slide: 2 }];
    mocks.planAndApplyCanvasDeckEdit.mockResolvedValue({
      status: 'needs_confirmation',
      title: 'Klimaplan',
      summary: 'Folie 2 gelöscht',
      operations,
      basePageIds: ['a', 'b'],
    });
    const out = await run(edit(stateWith('Lösch Folie 2')), {
      anweisung: 'Folie 2 löschen',
      confirm: false,
    });
    expect(out).toMatchObject({ ok: true, needsConfirmation: true });
    expect(JSON.stringify(out)).not.toContain('confirm=true');
    expect(mocks.planAndApplyCanvasDeckEdit).toHaveBeenCalledWith(
      expect.objectContaining({ destructiveAllowed: false })
    );
    expect(confirm.emitToolConfirmAction).toHaveBeenCalledTimes(1);
    const [, pending, rows] = confirm.emitToolConfirmAction.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Array<{ key: string; value: string }>,
    ];
    expect(pending).toMatchObject({
      type: 'apply_canvas_deck_edit',
      userId: 'u1',
      threadId: 't1',
      payload: {
        canvasId: 'p1',
        title: 'Klimaplan',
        summary: 'Folie 2 gelöscht',
        operations,
        basePageIds: ['a', 'b'],
      },
    });
    expect(rows.map((r) => r.key)).toEqual(['Präsentation', 'Änderung']);
  });

  it('reports an applied change', async () => {
    mocks.planAndApplyPresentationEdit.mockResolvedValue({
      status: 'applied',
      title: 'Deck',
      summary: '1× update_slide',
      applied: 1,
      skipped: [],
      live: true,
    });
    const out = await run(edit(stateWith('Mach Folie 3 kürzer')), {
      anweisung: 'Folie 3 kürzer',
      confirm: false,
    });
    expect(out).toMatchObject({ ok: true, operationCount: 1 });
    expect(out.note).toMatch(/geändert/);
  });

  it('asks back before deleting slides', async () => {
    mocks.planAndApplyPresentationEdit.mockResolvedValue({
      status: 'needs_confirmation',
      title: 'Deck',
      summary: '1× delete_slide',
    });
    const out = await run(edit(stateWith('Lösch Folie 2')), { anweisung: 'x', confirm: false });
    expect(out.needsConfirmation).toBe(true);
  });

  it('refuses confirm=true nobody agreed to', async () => {
    const out = await run(edit(stateWith('Mach es schöner')), { anweisung: 'x', confirm: true });
    expect(out.error).toMatch(/nicht zugestimmt/);
    expect(mocks.planAndApplyPresentationEdit).not.toHaveBeenCalled();
  });

  it('deletes after the person said ja', async () => {
    mocks.planAndApplyPresentationEdit.mockResolvedValue({ status: 'failed', message: 'x' });
    await run(edit(stateWith('ja')), { anweisung: 'Folie 2 löschen', confirm: true });
    expect(mocks.planAndApplyPresentationEdit).toHaveBeenCalledWith(
      expect.objectContaining({ presentationId: 'p1', destructiveAllowed: true })
    );
  });
});
