import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiObject: vi.fn(),
  createCanvas: vi.fn(),
  seedCanvasPages: vi.fn(),
  insertCanvasVersion: vi.fn(),
}));

vi.mock('../ai/generate.js', () => ({ aiObject: mocks.aiObject }));
vi.mock('../canvas/canvasRepository.js', () => ({ createCanvas: mocks.createCanvas }));
vi.mock('../canvas/canvasStateService.js', () => ({ seedCanvasPages: mocks.seedCanvasPages }));
vi.mock('../canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: mocks.insertCanvasVersion,
}));

// Deterministic fake for the font metrics: a line holds `width / (fontPx * 0.9)`
// characters, so text height is a pure function of length, width and size.
vi.mock('../../routes/presentations/slideTextMetrics.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../routes/presentations/slideTextMetrics.js')>();
  return {
    ...real,
    metricsReady: async () => true,
    faceRegistered: () => true,
    countLinesSync: (runs: Array<{ text: string }>, opts: { maxWidthPx: number; fontPx: number }) =>
      Math.max(
        1,
        Math.ceil(runs.map((r) => r.text).join('').length / (opts.maxWidthPx / (opts.fontPx * 0.9)))
      ),
  };
});

const { generateCanvasDeck, deckSystemPrompt } = await import('./canvasDeckGeneration.js');

type Validate = (input: unknown, attempt: number, attempts: number) => unknown;

const okSpec = {
  title: 'Radwege',
  slides: [
    { layout: 'titel', slots: { headline: 'Rad' }, notes: 'Begrüßen' },
    { layout: 'textfolie', slots: { headline: 'Lage', spalte1: '• Eins\n• Zwei' } },
    { layout: 'danke', slots: {} },
  ],
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createCanvas.mockResolvedValue({ id: 'canvas-1', title: 'Radwege' });
});

describe('generateCanvasDeck', () => {
  it('persists a slide-16-9 canvas with one page per slide and returns its URL', async () => {
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const v = call.validate(okSpec, 1, 3) as { ok: boolean; value: unknown };
      expect(v.ok).toBe(true);
      return { ok: true, data: v.value };
    });

    const created = await generateCanvasDeck({ prompt: 'Radwege', userId: 'u1', locale: 'de-AT' });

    expect(created).toEqual({
      documentId: 'canvas-1',
      title: 'Radwege',
      subtype: 'canvas',
      url: '/studio/canvas/canvas-1',
    });
    const input = mocks.createCanvas.mock.calls[0]![1];
    expect(mocks.createCanvas.mock.calls[0]![0]).toBe('u1');
    expect(input).toMatchObject({
      format: 'slide-16-9',
      template_type: 'freeform-at',
      page_count: 3,
    });
    expect(input.initial_state.pages).toHaveLength(3);
    expect(input.initial_state.pages.map((p: { id: string }) => p.id)).toEqual([
      'seed-0',
      'seed-1',
      'seed-2',
    ]);
    expect(mocks.seedCanvasPages).toHaveBeenCalledWith(
      'canvas-1',
      'freeform-at',
      input.initial_state
    );
    expect(mocks.insertCanvasVersion).toHaveBeenCalledOnce();
    expect(mocks.aiObject.mock.calls[0]![0]).toMatchObject({ lane: 'doc_generation' });
  });

  it('returns null and writes nothing when generation fails', async () => {
    mocks.aiObject.mockResolvedValue({ ok: false, error: 'x' });
    expect(await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' })).toBeNull();
    expect(mocks.createCanvas).not.toHaveBeenCalled();
  });

  it('rejects a bad structure and an overflowing slot with a message naming slide and slot, then shrinks on the last attempt', async () => {
    // 22 chars in a 128px headline box (1200 wide) is one line; the fake wraps
    // earlier at a huge size, so use a long column text instead: 13+ lines.
    const long = 'x'.repeat(420);
    const overflowing = {
      title: 'Lang',
      slides: [
        { layout: 'titel', slots: { headline: 'Kurz' } },
        { layout: 'textfolie', slots: { headline: 'Lage', spalte1: long } },
      ],
    };
    let rejection = '';
    let accepted: { fontSize: number } | null = null;
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const bad = call.validate(
        { title: 'T', slides: [{ layout: 'text-bild', slots: {} }] },
        1,
        2
      ) as {
        ok: boolean;
        error: string;
      };
      expect(bad.ok).toBe(false);
      const first = call.validate(overflowing, 1, 2) as { ok: boolean; error: string };
      expect(first.ok).toBe(false);
      rejection = first.error;
      const last = call.validate(overflowing, 2, 2) as { ok: boolean; value: unknown };
      expect(last.ok).toBe(true);
      return { ok: true, data: last.value };
    });

    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });

    expect(rejection).toMatch(/Folie 2, Feld spalte1/);
    const pages = mocks.createCanvas.mock.calls[0]![1].initial_state.pages as Array<{
      state: { additionalTexts: Array<{ id: string; fontSize: number }> };
    }>;
    accepted = pages[1]!.state.additionalTexts.find((t) => t.id === 'folie-spalte-1')!;
    // Shrunk, but never below 70 % of the layout's 36 px.
    expect(accepted.fontSize).toBeLessThan(36);
    expect(accepted.fontSize).toBeGreaterThanOrEqual(Math.floor(36 * 0.7));
  });
});

describe('deckSystemPrompt', () => {
  it('lists layouts with budgets and forks on Austria', () => {
    const de = deckSystemPrompt('de-DE');
    expect(de).toContain('"textfolie"');
    expect(de).toContain('höchstens 420 Zeichen');
    expect(de).not.toContain('ÖSTERREICH');
    expect(deckSystemPrompt('de-AT')).toContain('ÖSTERREICH');
  });
});
