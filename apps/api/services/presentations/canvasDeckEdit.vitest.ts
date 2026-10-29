import { composeSlideDeck } from '@gruenerator/contracts/slides';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiObject: vi.fn<(...a: unknown[]) => unknown>(),
  checkCanvasWriteAccess: vi.fn<(...a: unknown[]) => unknown>(),
  getCanvas: vi.fn<(...a: unknown[]) => unknown>(),
  getCurrentDeckState: vi.fn<(...a: unknown[]) => unknown>(),
  applyDeckChanges: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../ai/generate.js', () => ({ aiObject: (...a: unknown[]) => mocks.aiObject(...a) }));
vi.mock('../canvas/canvasRepository.js', () => ({
  checkCanvasWriteAccess: (...a: unknown[]) => mocks.checkCanvasWriteAccess(...a),
  getCanvas: (...a: unknown[]) => mocks.getCanvas(...a),
}));
vi.mock('../canvas/canvasStateService.js', () => ({
  getCurrentDeckState: (...a: unknown[]) => mocks.getCurrentDeckState(...a),
  applyDeckChanges: (...a: unknown[]) => mocks.applyDeckChanges(...a),
}));

const { describeDeckForEditing, planAndApplyCanvasDeckEdit } = await import('./canvasDeckEdit.js');

const pages = composeSlideDeck(
  {
    title: 'Klimaplan',
    slides: [
      { layout: 'titel', slots: { headline: 'Klima' } },
      { layout: 'textfolie', slots: { headline: 'Warum', spalte1: '• Weil es eilt' } },
    ],
  },
  { locale: 'de-AT', date: new Date('2026-10-29') }
).pages;

/** The model's answer runs through the real `validate` of the call. */
function modelAnswers(operations: unknown) {
  mocks.aiObject.mockImplementation(async (call: unknown) => {
    const result = (
      call as { validate: (i: unknown) => { ok: boolean; value?: unknown } }
    ).validate({ operations });
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: 'invalid' };
  });
}

const run = (destructiveAllowed = false) =>
  planAndApplyCanvasDeckEdit({
    canvasId: 'c1',
    userId: 'u1',
    instruction: 'x',
    destructiveAllowed,
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.checkCanvasWriteAccess.mockResolvedValue({ kind: 'ok' });
  mocks.getCanvas.mockResolvedValue({ kind: 'ok', canvas: { title: 'Klimaplan' } });
  mocks.getCurrentDeckState.mockResolvedValue({ pages, source: 'yjs' });
});

describe('planAndApplyCanvasDeckEdit', () => {
  it('shows the model element ids without the footer', () => {
    const text = describeDeckForEditing(pages);
    expect(text).toContain('Folie 2:');
    expect(text).toContain('folie-spalte-1: „• Weil es eilt"');
    expect(text).not.toContain('folie-seitenzahl');
  });

  it('writes a text change as a page patch', async () => {
    modelAnswers([
      {
        kind: 'edit-slide',
        slide: 2,
        operations: [{ kind: 'set-text', field: 'folie-headline', label: 'Titel', value: 'Darum' }],
      },
    ]);
    const out = await run();
    expect(out).toMatchObject({ status: 'applied', title: 'Klimaplan', applied: 1 });
    const [, changes] = mocks.applyDeckChanges.mock.calls[0] as [string, Record<string, unknown>];
    expect(changes['replacePages']).toBeUndefined();
    expect(changes['pagePatches']).toEqual([
      { pageId: pages[1]!.id, patch: { additionalTexts: expect.any(Array) } },
    ]);
  });

  it('asks before removing a slide and writes nothing', async () => {
    modelAnswers([{ kind: 'remove-slide', slide: 2 }]);
    expect(await run()).toMatchObject({ status: 'needs_confirmation' });
    expect(mocks.applyDeckChanges).not.toHaveBeenCalled();
  });

  it('replaces the page set after confirmation, new slides in the deck brand', async () => {
    modelAnswers([
      { kind: 'remove-slide', slide: 1 },
      { kind: 'add-slide', afterSlide: 2, slide: { layout: 'danke', slots: {} } },
    ]);
    expect(await run(true)).toMatchObject({ status: 'applied', applied: 2 });
    const [, changes] = mocks.applyDeckChanges.mock.calls[0] as [
      string,
      { replacePages: Array<{ configId: string }> },
    ];
    expect(changes.replacePages).toHaveLength(2);
    expect(changes.replacePages[1]!.configId).toBe('freeform-at');
  });

  it('fails without write access or a plan', async () => {
    mocks.checkCanvasWriteAccess.mockResolvedValueOnce({ kind: 'forbidden' });
    expect(await run()).toMatchObject({ status: 'failed' });
    modelAnswers([{ kind: 'edit-slide', slide: 1, operations: [{ kind: 'set-color-mode' }] }]);
    expect(await run()).toMatchObject({ status: 'failed' });
    expect(mocks.applyDeckChanges).not.toHaveBeenCalled();
  });
});
