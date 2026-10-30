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

vi.mock('../sharepicVorlagen/catalog.js', () => ({
  listFolienVorlagen: (locale: string) =>
    locale === 'de-AT'
      ? [
          { id: 'at-ruhig', titel: 'Ruhig AT', stil: 'ruhig', standard: true },
          { id: 'at-band', titel: 'Band AT', stil: 'band' },
        ]
      : [
          { id: 'de-cd', titel: 'Corporate Design', stil: 'cd', standard: true },
          { id: 'de-band', titel: 'Mit Farbband', stil: 'band' },
        ],
  defaultDeckStil: (locale: string) => (locale === 'de-AT' ? 'ruhig' : 'cd'),
}));

// Deterministic measure: only a headline marked ÜBERLANG never fits its box.
vi.mock('./canvasDeckOverflow.js', () => ({
  prepareOverflowMeasuring: async () => true,
  serverMeasureText: () => (text: string) => ({ height: text.includes('ÜBERLANG') ? Infinity : 1 }),
}));

const { generateCanvasDeck, deckSystemPrompt } = await import('./canvasDeckGeneration.js');

type Validate = (input: unknown, attempt: number, attempts: number) => unknown;

const okSpec = {
  title: 'Radwege',
  slides: [
    { typ: 'titel', slots: { headline: 'Rad' }, notes: 'Begrüßen' },
    { typ: 'liste', slots: { headline: 'Lage', punkte: ['Eins', 'Zwei', 'Drei'] } },
    { typ: 'danke', slots: {} },
  ],
};

/** The model answers once with `specs[0]`, then `specs[1]` ...; validate runs for real. */
function modelAnswers(...specs: unknown[]) {
  mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
    let last: { ok: boolean; error?: string; value?: unknown } = { ok: false };
    for (const [i, spec] of specs.entries()) {
      last = call.validate(spec, i + 1, 2) as typeof last;
      if (last.ok) return { ok: true, data: last.value };
    }
    return { ok: false, error: last.error };
  });
}

const stilOf = () =>
  (
    mocks.createCanvas.mock.calls[0]![1].initial_state.pages as Array<{
      state: { deckStil: string };
    }>
  ).map((p) => p.state.deckStil);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createCanvas.mockResolvedValue({ id: 'canvas-1', title: 'Radwege' });
});

describe('generateCanvasDeck', () => {
  it('persists a slide-16-9 canvas with one page per slide and returns its URL', async () => {
    modelAnswers(okSpec);

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

  it('uses the named vorlage when it is in the catalogue', async () => {
    modelAnswers({ ...okSpec, vorlage: 'de-band' });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(new Set(stilOf())).toEqual(new Set(['band']));
  });

  it('ignores an unknown vorlage and uses the default', async () => {
    modelAnswers({ ...okSpec, vorlage: 'at-band' });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(new Set(stilOf())).toEqual(new Set(['cd']));
    mocks.createCanvas.mockClear();
    modelAnswers(okSpec);
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-AT' });
    expect(new Set(stilOf())).toEqual(new Set(['ruhig']));
  });

  it('rejects a bad structure with a message naming slide and slot', async () => {
    let error = '';
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const bad = call.validate(
        { title: 'T', slides: [{ typ: 'titel', slots: { headline: 'x'.repeat(80) } }] },
        1,
        2
      ) as { ok: boolean; error: string };
      error = bad.error;
      return { ok: false, error: 'x' };
    });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(error).toMatch(/Folie 1, Feld headline/);
  });

  it('rejects a deck whose fitted headlines still overflow and retries once', async () => {
    const overflowing = {
      title: 'Lang',
      slides: [
        { typ: 'titel', slots: { headline: 'ÜBERLANG' } },
        { typ: 'liste', slots: { headline: 'Lage', punkte: ['Eins', 'Zwei', 'Drei'] } },
      ],
    };
    let rejection = '';
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const first = call.validate(overflowing, 1, 2) as { ok: boolean; error: string };
      expect(first.ok).toBe(false);
      rejection = first.error;
      // The last attempt takes the minimum size as it is.
      const last = call.validate(overflowing, 2, 2) as { ok: boolean; value: unknown };
      expect(last.ok).toBe(true);
      return { ok: true, data: last.value };
    });

    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });

    expect(rejection).toContain('Folie 1');
    expect(rejection).toContain('folie-headline');
    expect(mocks.createCanvas).toHaveBeenCalledOnce();
  });
});

describe('deckSystemPrompt', () => {
  it('lists the folientypen and the vorlagen of the country and forks on Austria', () => {
    const de = deckSystemPrompt('de-DE');
    expect(de).toContain('"liste"');
    expect(de).toContain('Für drei bis sechs kurze Punkte nimm `liste`, nicht `text`.');
    expect(de).toContain('`zahl` nur mit einer Zahl aus dem Material und ihrer Quelle');
    expect(de).toContain('höchstens zwei Wörter mit `==…==` hervor');
    expect(de).toContain('de-band (Mit Farbband)');
    expect(de).not.toContain('at-band');
    expect(de).not.toContain('ÖSTERREICH');
    const at = deckSystemPrompt('de-AT');
    expect(at).toContain('ÖSTERREICH');
    expect(at).toContain('at-band (Band AT)');
  });
});
