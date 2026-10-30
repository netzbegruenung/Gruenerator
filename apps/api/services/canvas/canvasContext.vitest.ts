import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getCurrentDeckState: vi.fn(),
  getCurrentCanvasState: vi.fn(),
}));

vi.mock('./canvasRepository.js', () => ({ getCanvas: mocks.getCanvas }));
vi.mock('./canvasStateService.js', () => ({
  getCurrentDeckState: mocks.getCurrentDeckState,
  getCurrentCanvasState: mocks.getCurrentCanvasState,
}));

const { loadCanvasAsContext, canvasAccessible } = await import('./canvasContext.js');

const page = (texts: Array<[string, string]>, order: string[], notes = '') => ({
  id: 'p',
  configId: 'freeform',
  state: {
    additionalTexts: texts.map(([id, text]) => ({ id, text })),
    layerOrder: order,
    notes,
  },
});

const deck = {
  pages: [
    page(
      [
        ['folie-datum', 'Donnerstag, 29. Oktober 2026'],
        ['folie-headline', 'Verkehrs**wende**'],
        ['folie-text', 'Mehr ==Radwege== für Graz'],
        ['folie-titel', 'Radwege'],
        ['folie-seitenzahl', '1'],
      ],
      ['folie-headline', 'folie-text', 'folie-datum', 'folie-titel', 'folie-seitenzahl']
    ),
    page(
      [
        ['folie-spalte-1', '• Punkt A'],
        ['folie-headline', 'Plan'],
        ['folie-datum', 'x'],
      ],
      ['folie-headline', 'folie-spalte-1', 'folie-datum'],
      'Hier lange verweilen'
    ),
  ],
  source: 'yjs',
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe('loadCanvasAsContext', () => {
  it('renders a slide deck page by page without footer texts or inline marks', async () => {
    mocks.getCanvas.mockResolvedValue({
      kind: 'ok',
      canvas: { title: 'Radwege', format: 'slide-16-9' },
    });
    mocks.getCurrentDeckState.mockResolvedValue(deck);

    const text = await loadCanvasAsContext('c1', 'u1');

    expect(text).toBe(
      [
        '# Radwege',
        '## Folie 1\nVerkehrswende\nMehr Radwege für Graz',
        '## Folie 2\nPlan\n• Punkt A\nNotizen: Hier lange verweilen',
      ].join('\n\n')
    );
    expect(mocks.getCanvas).toHaveBeenCalledWith('c1', 'u1');
  });

  it('calls the pages „Seite“ when the canvas is no slide deck', async () => {
    mocks.getCanvas.mockResolvedValue({ kind: 'ok', canvas: { title: 'Flyer', format: 'a4' } });
    mocks.getCurrentDeckState.mockResolvedValue({ pages: [], source: 'initial_state' });
    mocks.getCurrentCanvasState.mockResolvedValue({
      state: { additionalTexts: [{ id: 'a', text: 'Hallo' }], layerOrder: ['a'] },
      source: 'yjs',
    });
    expect(await loadCanvasAsContext('c2', 'u1')).toBe('# Flyer\n\n## Seite 1\nHallo');
  });

  it('returns null without access or when the canvas is gone', async () => {
    mocks.getCanvas.mockResolvedValue({ kind: 'forbidden' });
    expect(await loadCanvasAsContext('c3', 'u1')).toBeNull();
    expect(mocks.getCurrentDeckState).not.toHaveBeenCalled();
    expect(await canvasAccessible('c3', 'u1')).toBe(false);
  });
});
