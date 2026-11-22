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

const { generateCanvasDeck, deckSystemPrompt, deckToolSchema } =
  await import('./canvasDeckGeneration.js');

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

type Created = {
  format: string;
  template_type: string;
  page_count: number;
  initial_state: { pages: Array<{ id: string; state: { deckStil: string } }> };
};
const created = (): Created => mocks.createCanvas.mock.calls[0]![1] as Created;
const stilOf = () => created().initial_state.pages.map((p) => p.state.deckStil);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createCanvas.mockResolvedValue({ id: 'canvas-1', title: 'Radwege' });
});

describe('generateCanvasDeck', () => {
  it('persists a slide-16-9 canvas with one page per slide and returns its URL', async () => {
    modelAnswers(okSpec);

    const result = await generateCanvasDeck({ prompt: 'Radwege', userId: 'u1', locale: 'de-AT' });

    expect(result).toEqual({
      documentId: 'canvas-1',
      title: 'Radwege',
      subtype: 'canvas',
      url: '/studio/canvas/canvas-1',
    });
    const input = created();
    expect(mocks.createCanvas.mock.calls[0]![0]).toBe('u1');
    expect(input).toMatchObject({
      format: 'slide-16-9',
      template_type: 'freeform-at',
      page_count: 3,
    });
    expect(input.initial_state.pages.map((p) => p.id)).toEqual(['seed-0', 'seed-1', 'seed-2']);
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

  it('reads the invented singular `punkt` as the list slot `punkte`', async () => {
    modelAnswers({
      title: 'Radwege',
      slides: [
        { typ: 'titel', slots: { headline: 'Rad' } },
        { typ: 'liste', slots: { headline: 'Lage', punkt: ['Eins', 'Zwei', 'Drei'] } },
      ],
    });
    const result = await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(result).not.toBeNull();
    expect(created().page_count).toBe(2);
  });

  it('drops empty slots of another type instead of rejecting the deck', async () => {
    // Live 22.11.: the model sent `"kontakt": ""` on a Kernsatz in every deck.
    modelAnswers({
      title: 'Radwege',
      slides: [
        { typ: 'titel', slots: { headline: 'Rad', stoerer: '' } },
        { typ: 'kernsatz', slots: { ueberschrift: 'Ziel', satz: 'Mehr Rad', kontakt: '' } },
        { typ: 'kernsatz', slots: { satz: 'Mehr Bus', punkte: [] } },
      ],
    });
    const result = await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(result).not.toBeNull();
    expect(created().page_count).toBe(3);
  });

  it('aligns the three symbole arrays by the labels and falls back to the neutral icon', async () => {
    modelAnswers({
      title: 'Radwege',
      slides: [
        { typ: 'titel', slots: { headline: 'Rad' } },
        {
          typ: 'symbole',
          slots: {
            headline: 'Was wir anbieten',
            // One icon too few, one line too many, one unknown key: none of it may fail the deck.
            symbole: ['bahn', 'Quatsch'],
            labels: ['Mehr Bahn', 'Kita-Plätze', 'Sichere Wege'],
            zeilen: ['a', 'b', 'c', 'd'],
          },
        },
      ],
    });
    expect(await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' })).not.toBeNull();
    const page = created().initial_state.pages[1]!.state as unknown as {
      iconStates: Record<string, { iconId: string }>;
      additionalTexts: Array<{ id: string }>;
    };
    expect(Object.values(page.iconStates).map((i) => i.iconId)).toEqual([
      'tabler:train',
      'tabler:star',
      'tabler:star',
    ]);
    expect(page.additionalTexts.some((t) => t.id === 'folie-symboltext-4')).toBe(false);
  });

  it('offers the symbole icon keys to the model as a closed list', () => {
    const slots = (
      deckToolSchema().properties as {
        slides: { items: { properties: { slots: { properties: Record<string, unknown> } } } };
      }
    ).slides.items.properties.slots.properties;
    const symbole = slots['symbole'] as { items: { enum: string[] } };
    expect(symbole.items.enum).toContain('bahn');
    expect(deckSystemPrompt('de-DE')).toContain('"symbole"');
    expect(deckSystemPrompt('de-DE')).toMatch(/erlaubt sind nur: .*bahn/);
  });

  it('reads „Vielen Dank!“ on the closing slide as its default line', async () => {
    modelAnswers({
      title: 'Radwege',
      slides: [
        { typ: 'titel', slots: { headline: 'Rad' } },
        { typ: 'danke', slots: { headline: 'Vielen Dank!' } },
      ],
    });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    const danke = created().initial_state.pages[1]!.state as unknown as {
      additionalTexts: Array<{ id: string; text: string }>;
    };
    const ids = danke.additionalTexts.map((t) => t.id);
    expect(ids).toContain('folie-text');
  });

  it('keeps the deck without a broken slide on the last attempt', async () => {
    // Live 22.11. (chat probe p12): attempt 1 had a too-long `zahl`, the repair dropped
    // `text` and `quelle` — the whole deck was lost for one slide.
    const good = [
      { typ: 'titel', slots: { headline: 'Haushalt 2027' } },
      { typ: 'liste', slots: { headline: 'Was wir ändern', punkte: ['a', 'b', 'c'] } },
    ];
    modelAnswers(
      {
        title: 'Haushalt',
        slides: [
          good[0],
          { typ: 'zahl', slots: { zahl: '41,3 Mio. €', text: 't', quelle: 'q' } },
          good[1],
        ],
      },
      { title: 'Haushalt', slides: [good[0], { typ: 'zahl', slots: { zahl: '41 Mio' } }, good[1]] }
    );
    const result = await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(result).not.toBeNull();
    expect(created().page_count).toBe(2);
  });

  it('still rejects a broken slide while a retry is left', async () => {
    modelAnswers({
      title: 'Haushalt',
      slides: [
        { typ: 'titel', slots: { headline: 'Haushalt 2027' } },
        { typ: 'zahl', slots: { zahl: '41 Mio' } },
        { typ: 'liste', slots: { headline: 'H', punkte: ['a', 'b', 'c'] } },
      ],
    });
    const result = await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(result).toBeNull();
  });

  it('drops a stock kicker above the Kernsatz but keeps a real one', async () => {
    modelAnswers({
      title: 'Radwege',
      slides: [
        { typ: 'titel', slots: { headline: 'Rad' } },
        { typ: 'kernsatz', slots: { ueberschrift: 'Unser Ziel:', satz: 'Mehr Rad' } },
        { typ: 'kernsatz', slots: { ueberschrift: 'Ziel bis 2030', satz: 'Mehr Rad' } },
      ],
    });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    const kicker = (i: number) =>
      (
        created().initial_state.pages[i]!.state as unknown as {
          additionalTexts: Array<{ id: string; text: string }>;
        }
      ).additionalTexts.find((t) => t.id === 'folie-headline')?.text ?? '';
    expect(kicker(1)).toBe('');
    expect(kicker(2)).toBe('Ziel bis 2030');
  });

  it('puts a foreign slot into the one missing required slot of its kind', async () => {
    // Live 22.11.: `zitat` instead of `text` on the Zahl slide, `stichpunkte` for `punkte`.
    modelAnswers({
      title: 'Klima',
      slides: [
        { typ: 'zahl', slots: { zahl: '46 %', quelle: 'UBA', zitat: 'weniger Emissionen' } },
        { typ: 'liste', slots: { headline: 'H', stichpunkte: ['a', 'b', 'c'] } },
        // `kontakt` copying the Kernsatz: nothing is missing, the copy goes.
        { typ: 'kernsatz', slots: { satz: 'Mehr Rad', kontakt: 'Mehr Rad' } },
      ],
    });
    const result = await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(result).not.toBeNull();
    const texts = (i: number) =>
      (
        created().initial_state.pages[i]!.state as unknown as {
          additionalTexts: Array<{ id: string; text: string }>;
        }
      ).additionalTexts;
    expect(texts(0).find((t) => t.id === 'folie-zahl-text')?.text).toBe('weniger Emissionen');
    expect(texts(1).filter((t) => t.id.startsWith('folie-punkt-'))).toHaveLength(3);
    expect(texts(2).some((t) => t.id === 'folie-kontakt')).toBe(false);
  });

  it('names the missing slot when a foreign one cannot stand in for it', async () => {
    let error = '';
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const bad = call.validate(
        { title: 'T', slides: [{ typ: 'liste', slots: { headline: 'H', stichpunkte: ['a'] } }] },
        1,
        2
      ) as { ok: boolean; error: string };
      error = bad.error;
      return { ok: false, error: 'x' };
    });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(error).toContain('Folie 1, Feld punkte');
  });

  it('refuses a quote whose author is not in the prompt, and drops the name last', async () => {
    const spec = {
      title: 'Klima',
      slides: [
        { typ: 'titel', slots: { headline: 'Klima' } },
        {
          typ: 'zitat',
          slots: { zitat: 'Wir sind die erste Generation', name: 'António Guterres' },
        },
      ],
    };
    const errors: string[] = [];
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const first = call.validate(spec, 1, 2) as { ok: boolean; error: string };
      errors.push(first.error);
      const last = call.validate(spec, 2, 2) as { ok: boolean; value: unknown };
      return { ok: true, data: last.value };
    });
    await generateCanvasDeck({ prompt: 'Vortrag über Klimaschutz', userId: 'u1', locale: 'de-DE' });
    expect(errors[0]).toContain('Folie 2: dieses Zitat steht nicht im Auftrag');
    const zitat = created().initial_state.pages[1]!.state as unknown as {
      additionalTexts: Array<{ id: string }>;
    };
    expect(zitat.additionalTexts.some((t) => t.id === 'folie-zitat-name')).toBe(false);
  });

  it('asks for a kernsatz instead of a quote without an author', async () => {
    let error = '';
    mocks.aiObject.mockImplementation(async (call: { validate: Validate }) => {
      const first = call.validate(
        { title: 'T', slides: [{ typ: 'zitat', slots: { zitat: 'Klimaschutz ist Pflicht' } }] },
        1,
        2
      ) as { ok: boolean; error: string };
      error = first.error;
      return { ok: false, error: 'x' };
    });
    await generateCanvasDeck({ prompt: 'x', userId: 'u1', locale: 'de-DE' });
    expect(error).toContain('Folie 1: ein Zitat braucht `name`');
  });

  it('keeps a quote whose author the prompt names', async () => {
    modelAnswers({
      title: 'Klima',
      slides: [
        {
          typ: 'zitat',
          slots: { zitat: 'Klimaschutz ist Menschenschutz', name: 'Katharina Dröge' },
        },
      ],
    });
    await generateCanvasDeck({
      prompt: 'Mit dem Zitat von Katharina Dröge: „Klimaschutz ist Menschenschutz“',
      userId: 'u1',
      locale: 'de-DE',
    });
    const state = created().initial_state.pages[0]!.state as unknown as {
      additionalTexts: Array<{ id: string; text: string }>;
    };
    expect(state.additionalTexts.find((t) => t.id === 'folie-zitat-name')?.text).toBe(
      'Katharina Dröge'
    );
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
    expect(de).toContain('Höchstens EINE Hervorhebung `==…==` pro Folie');
    expect(de).toContain('Schreib nie jemandem ein Zitat zu, das nicht im Auftrag steht');
    expect(de).toContain('de-band (Mit Farbband)');
    expect(de).not.toContain('at-band');
    expect(de).not.toContain('ÖSTERREICH');
    const at = deckSystemPrompt('de-AT');
    expect(at).toContain('ÖSTERREICH');
    expect(at).toContain('at-band (Band AT)');
  });
});

describe('list slots in prompt and tool schema', () => {
  it('shows `punkte` as an array of strings with an example', () => {
    const de = deckSystemPrompt('de-DE');
    expect(de).toContain('punkte: Array von Texten');
    expect(de).toContain('{"typ": "liste", "slots": {"headline": ');
    expect(de).toContain('"punkte": ["');
  });

  it('describes `punkte` in the tool schema and allows no other slot names', () => {
    const slides = (deckToolSchema().properties as Record<string, Record<string, unknown>>)
      .slides as { items: { properties: { slots: Record<string, unknown> } } };
    const slots = slides.items.properties.slots as {
      additionalProperties: boolean;
      properties: Record<string, { type: string; items?: unknown; description?: string }>;
    };
    expect(slots.additionalProperties).toBe(false);
    expect(slots.properties.punkte).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect(slots.properties.punkte!.description).toMatch(/Array von Texten/);
    expect(slots.properties.punkt).toBeUndefined();
  });
});

describe('slide count', () => {
  it('counts a requested number of slides including title and thank-you slide', () => {
    expect(deckSystemPrompt('de-DE')).toContain(
      'Nennt die Person eine Folienzahl, ist das die Gesamtzahl — Titel- und Danke-Folie zählen mit'
    );
  });
});

// Ein Bild aus dem Gespräch in der Präsentation (06.11.2026).
describe('generateCanvasDeck with the thread image', () => {
  const PHOTO = '/api/share/abcdefghijklmnop1234/download';
  type Page = { state: { currentImageSrc?: string; deckStil: string } };
  const pages = () => created().initial_state.pages as unknown as Page[];

  it('offers the Bildfolie only when there is an image', () => {
    expect(deckSystemPrompt('de-DE')).not.toContain('"bild"');
    expect(deckSystemPrompt('de-DE', true)).toContain('genau eine Folie vom Typ "bild"');
    const typEnum = (withPhoto: boolean) =>
      (
        deckToolSchema(withPhoto).properties as Record<
          string,
          { items: { properties: { typ: { enum: string[] } } } }
        >
      ).slides!.items.properties.typ.enum;
    expect(typEnum(false)).not.toContain('bild');
    expect(typEnum(true)).toContain('bild');
  });

  it('puts the image on the Bildfolie the model set', async () => {
    modelAnswers({
      ...okSpec,
      slides: [
        okSpec.slides[0],
        { typ: 'bild', slots: { unterschrift: 'Die Wiese' }, bild: 'https://evil.example/x.jpg' },
        okSpec.slides[2],
      ],
    });
    await generateCanvasDeck({ prompt: 'Blühwiesen', userId: 'u1', locale: 'de-DE', photo: PHOTO });
    expect(pages().map((p) => p.state.currentImageSrc ?? null)).toEqual([null, PHOTO, null]);
  });

  it('asks again without a Bildfolie, and sets one behind the title on the last attempt', async () => {
    modelAnswers(okSpec, okSpec);
    await generateCanvasDeck({ prompt: 'Blühwiesen', userId: 'u1', locale: 'de-DE', photo: PHOTO });
    expect(pages().map((p) => p.state.currentImageSrc ?? null)).toEqual([null, PHOTO, null, null]);
  });

  it('refuses a Bildfolie when there is no image', async () => {
    modelAnswers({ ...okSpec, slides: [okSpec.slides[0], { typ: 'bild', slots: {} }] }, okSpec);
    await generateCanvasDeck({ prompt: 'Blühwiesen', userId: 'u1', locale: 'de-DE' });
    expect(pages()).toHaveLength(3);
    expect(pages().every((p) => p.state.currentImageSrc === undefined)).toBe(true);
  });
});

describe('withBildfolie', () => {
  it('gives a full deck its Bildfolie by dropping the last slide', async () => {
    const { withBildfolie } = await import('./canvasDeckGeneration.js');
    const { MAX_SLIDES } = await import('@gruenerator/contracts/slides');
    const full = {
      title: 'Voll',
      slides: Array.from({ length: MAX_SLIDES }, (_, i) => ({
        typ: 'titel',
        slots: { headline: `F${i}` },
      })),
    } as never;
    const out = withBildfolie(full, '/api/share/tok/download');
    expect(out.slides).toHaveLength(MAX_SLIDES);
    expect(out.slides[1]).toMatchObject({ typ: 'bild', bild: '/api/share/tok/download' });
  });
});
