import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { seedPagesIfEmpty, serializeDeck } from '../collab/pagesDoc';
import { loadCanvasConfig } from '../configs/configLoader';

import { composeSharepic, type ComposedSlide } from './composeSharepic';
import {
  baselineProvenance,
  elementIdForKey,
  elementKey,
  fingerprint,
  liftPage,
  recomposePage,
} from './liftSharepicPage';
import {
  cover,
  deCarousel,
  gruende,
  marker,
  MORE_SPECS,
  options,
  SPECS,
} from './sharepicSpecFixtures';
import { applySharepicTweaks, type SharepicTweakChoice } from './sharepicTweaks';

/** One page per slide, as the mint stores it: the base one-slide spec and the composer's baseline. */
const pagesOf = (base: SharepicSpec, tweaks: SharepicTweakChoice = {}) => {
  const composed = composeSharepic(applySharepicTweaks(base, tweaks), {
    ...options,
    provenance: true,
  });
  return composed.slides.map((slide, s) => ({
    slide: { ...base, slides: [base.slides[s]!] },
    composed: slide,
    provenance: composed.provenance![s]!,
    baseline: fingerprint(slide),
  }));
};

/** The page state as the freeform config's `createInitialState` leaves it. */
const stateOf = (slide: ComposedSlide): Record<string, unknown> =>
  structuredClone({
    imageOffset: { x: 0, y: 0 },
    imageScale: 1,
    backgroundImageFile: null,
    illustrationInstances: [],
    frameInstances: [],
    balkenInstances: [],
    ...slide,
    isDesktop: false,
  });

type State = ReturnType<typeof stateOf>;
type Text = { id: string; text: string; x: number; y: number; fill?: string };
const texts = (state: State) => state.additionalTexts as Text[];
const textEl = (state: State, id: string) => {
  const found =
    texts(state).find((t) => t.id === id) ??
    (state.pillBadgeInstances as Text[]).find((p) => p.id === id);
  if (!found) throw new Error(`no text ${id}`);
  return found;
};

const page = (base: SharepicSpec, s: number) => {
  const p = pagesOf(base)[s]!;
  return { ...p, state: stateOf(p.composed) };
};

const TWEAKED: [string, SharepicSpec, SharepicTweakChoice][] = [
  [
    'deCarousel tweaked',
    deCarousel,
    { navigation: 'keine', liste: 'ziffern', zeilenboxen: 'an', farbe: 'mint', nummer: 'aus' },
  ],
  ['at tweaked', SPECS.at, { aufruf: 'ausruf', liste: 'haken' }],
  ['gruende tweaked', gruende, { nummer: 'geist', navigation: 'pfeil-punkte', farbe: 'wechsel' }],
];
const CASES: [string, SharepicSpec, SharepicTweakChoice][] = [
  ...Object.entries({ ...SPECS, ...MORE_SPECS }).map(
    ([name, spec]): [string, SharepicSpec, SharepicTweakChoice] => [name, spec, {}]
  ),
  ...TWEAKED,
];

describe('liftPage', () => {
  // The first loadCanvasConfig pays the dynamic config import; on a cold CI runner that alone
  // can exceed the 5 s test default, so it is paid once here instead of in the first case.
  beforeAll(async () => {
    await Promise.all(
      CASES.map(([, base, tweaks]) => {
        const composed = composeSharepic(applySharepicTweaks(base, tweaks), options);
        return loadCanvasConfig(composed.templateType, composed.format);
      })
    );
  }, 30_000);

  it.each(CASES)('round-trips an untouched page of %s unchanged', (_name, base, tweaks) => {
    for (const p of pagesOf(base, tweaks)) {
      const lifted = liftPage(stateOf(p.composed), { slide: p.slide, baseline: p.baseline });
      expect(lifted).toEqual({ slide: p.slide, overrides: [], foreign: [] });
    }
  });

  it.each(CASES)(
    'round-trips %s through the real freeform config and a Yjs page',
    async (_name, base, tweaks) => {
      const composed = composeSharepic(applySharepicTweaks(base, tweaks), options);
      const config = await loadCanvasConfig(composed.templateType, composed.format);
      const pages = pagesOf(base, tweaks);
      const sent = new Y.Doc();
      seedPagesIfEmpty(
        sent,
        pages.map((p, s) => ({
          id: `p${s}`,
          configId: composed.templateType,
          state: config.createInitialState(p.composed) as Record<string, unknown>,
        }))
      );
      // Over the wire, as another client reads it.
      const received = new Y.Doc();
      Y.applyUpdate(received, Y.encodeStateAsUpdate(sent));
      const states = serializeDeck(received).map((page) => page.state);
      expect(states).toHaveLength(pages.length);
      pages.forEach((p, s) => {
        expect(liftPage(states[s]!, { slide: p.slide, baseline: p.baseline })).toEqual({
          slide: p.slide,
          overrides: [],
          foreign: [],
        });
      });
    }
  );

  it.each(CASES)('derives the provenance of %s from the baseline alone', (_name, base, tweaks) => {
    for (const p of pagesOf(base, tweaks)) {
      expect(baselineProvenance(p.slide.slides[0]!, p.baseline)).toEqual(p.provenance);
    }
  });

  it('writes hand edits of verbatim, bullet, prefix and line texts into the spec', () => {
    const first = page(deCarousel, 0);
    textEl(first.state, 'sc-0-dachzeile').text = 'Klimaschutz bei uns';
    textEl(first.state, 'sc-quelle').text = 'Quelle: BMWK 2026';
    const one = liftPage(first.state, first);
    expect(one.overrides).toEqual([]);
    expect(one.slide.slides[0]!.items[0]).toEqual({
      type: 'dachzeile',
      text: 'Klimaschutz bei uns',
    });
    expect(one.slide.slides[0]!.quelle).toBe('BMWK 2026');

    const second = page(deCarousel, 1);
    textEl(second.state, 'sc-1-liste').text = '• Saubere Luft\n• Jobs\n• Mehr Rad';
    textEl(second.state, 'sc-0-headline-0').text = 'Drei Gründe\nfür Wind\nund Rad';
    const two = liftPage(second.state, second);
    expect(two.overrides).toEqual([]);
    expect(two.slide.slides[0]!.items).toEqual([
      { type: 'headline', lines: ['Drei Gründe', 'für Wind', 'und Rad'] },
      { type: 'liste', items: ['Saubere Luft', 'Jobs', 'Mehr Rad'] },
    ]);
    // Deck-level fields stay as they were.
    expect({ ...two.slide, slides: [] }).toEqual({ ...second.slide, slides: [] });
  });

  it('lifts a bullet typed after the list marker as one item (#4275)', () => {
    const second = page(deCarousel, 1);
    textEl(second.state, 'sc-1-liste').text = '• Saubere Luft\n• Jobs\n• • Radwege bauen';
    const lifted = liftPage(second.state, second);
    expect(lifted.overrides).toEqual([]);
    expect(lifted.slide.slides[0]!.items[1]).toEqual({
      type: 'liste',
      items: ['Saubere Luft', 'Jobs', 'Radwege bauen'],
    });
  });

  it('keeps a text it cannot write back as a text override', () => {
    const first = page(deCarousel, 0);
    textEl(first.state, 'sc-seite').text = 'Seite 1';
    // Emptied: the spec field needs a text.
    textEl(first.state, 'sc-0-dachzeile').text = '';
    const second = page(deCarousel, 1);
    // A bullet lost its mark; a three-line segment became two lines.
    textEl(second.state, 'sc-1-liste').text = '• Saubere Luft\nJobs';
    textEl(second.state, 'sc-0-headline-0').text = 'Drei Gründe\nfür Wind';

    const one = liftPage(first.state, first);
    expect(one.slide).toEqual(first.slide);
    expect(one.overrides).toEqual([
      { kind: 'text', key: { itemType: 'dachzeile', nth: 0, role: '*' }, text: '' },
      { kind: 'text', key: { itemType: null, nth: 0, role: 'sc-seite' }, text: 'Seite 1' },
    ]);
    const two = liftPage(second.state, second);
    expect(two.slide).toEqual(second.slide);
    expect(two.overrides.map((o) => o.kind === 'text' && o.key.itemType)).toEqual([
      'headline',
      'liste',
    ]);
  });

  it('does not lift a new line break into a one-line field', () => {
    const p = page(deCarousel, 0);
    textEl(p.state, 'sc-0-dachzeile').text = 'Klimaschutz\nvor Ort';
    textEl(p.state, 'sc-1-headline-0').text = 'Mach\nmit';
    textEl(p.state, 'sc-quelle').text = 'Quelle: UBA\n2025';
    const lifted = liftPage(p.state, p);
    expect(lifted.slide).toEqual(p.slide);
    expect(lifted.overrides.map((o) => o.kind === 'text' && o.text)).toEqual([
      'Klimaschutz\nvor Ort',
      'Mach\nmit',
      'Quelle: UBA\n2025',
    ]);
  });

  describe('a grown cover headline (the composer wrapped its lines)', () => {
    // `marker` slide 2 grows ['Reiche vernichten', '++186.600++ Jobs'] into four rows of one text.
    const grown = () => page(marker, 2);
    const ID = 'sc-0-headline-0';
    const headlineOf = (lifted: ReturnType<typeof liftPage>) => lifted.slide.slides[0]!.items[0];

    it.each([
      ['cover', cover, 0, 'sc-1-headline-0', 'Klimaschutz\nist\nHeimatschutz\nfür alle'],
      ['marker', marker, 2, ID, 'Reiche\nvernichten\n++186.600++\nJobs'],
    ] as const)('round-trips %s untouched', (_name, spec, s, id, rows) => {
      const p = page(spec, s);
      expect(textEl(p.state, id).text).toBe(rows);
      const lifted = liftPage(p.state, p);
      expect(lifted.overrides).toEqual([]);
      expect(lifted.slide).toEqual(p.slide);
    });

    it('lifts a hand-typed text with the same rows into the spec lines', () => {
      const p = grown();
      textEl(p.state, ID).text = 'Reiche\nverschleudern\n++186.600++\nJobs';
      const lifted = liftPage(p.state, p);
      expect(lifted.overrides).toEqual([]);
      expect(headlineOf(lifted)).toEqual({
        type: 'headline',
        lines: ['Reiche verschleudern', '++186.600++ Jobs'],
      });
    });

    it('lifts a text whose wraps the person removed, one row per spec line', () => {
      const p = grown();
      textEl(p.state, ID).text = 'Reiche zerstören\n++186.600++ Jobs';
      const lifted = liftPage(p.state, p);
      expect(lifted.overrides).toEqual([]);
      expect(headlineOf(lifted)).toEqual({
        type: 'headline',
        lines: ['Reiche zerstören', '++186.600++ Jobs'],
      });
    });

    it('keeps an ambiguous row count as a text override', () => {
      for (const text of ['Reiche\nvernichten\n++186.600++ Jobs', 'Reiche\n\nvernichten\nJobs']) {
        const p = grown();
        textEl(p.state, ID).text = text;
        const lifted = liftPage(p.state, p);
        expect(lifted.slide).toEqual(p.slide);
        expect(lifted.overrides).toEqual([
          { kind: 'text', key: { itemType: 'headline', nth: 0, role: '*-0' }, text },
        ]);
      }
    });
  });

  it('writes the text as the schema reads it', () => {
    const p = page(deCarousel, 0);
    textEl(p.state, 'sc-0-dachzeile').text = '  Neu hier  ';
    expect(liftPage(p.state, p).slide.slides[0]!.items[0]).toEqual({
      type: 'dachzeile',
      text: 'Neu hier',
    });
  });

  it('lifts into the base spec on a tweaked page where the text survives the tweak', () => {
    // `ziffern` sets each point as its own text: still the item, verbatim.
    const [, listed] = pagesOf(deCarousel, { liste: 'ziffern' });
    const state = stateOf(listed!.composed);
    textEl(state, 'sc-1-liste-1').text = 'Billiger Strom';
    const lifted = liftPage(state, listed!);
    expect(lifted.overrides).toEqual([]);
    expect(lifted.slide.slides[0]!.items[1]).toEqual({
      type: 'liste',
      items: ['Saubere Luft', 'Billiger Strom', 'Jobs vor Ort'],
    });
    // Line boxes rewrap a paragraph: an edit there stays an override.
    const [boxed] = pagesOf(deCarousel, { zeilenboxen: 'an' });
    const boxedState = stateOf(boxed!.composed);
    textEl(boxedState, 'sc-2-text-0').text = 'Gemeinsam';
    expect(liftPage(boxedState, boxed!)).toMatchObject({
      slide: boxed!.slide,
      overrides: [
        { kind: 'text', key: { itemType: 'text', nth: 0, role: '*-0' }, text: 'Gemeinsam' },
      ],
    });
  });

  it('records moved and restyled elements by item type and rank, not by index', () => {
    const p = page(deCarousel, 11);
    const second = textEl(p.state, 'sc-1-frage');
    second.x += 40;
    (second as { fill?: string }).fill = '#ff0000';
    const lifted = liftPage(p.state, p);
    expect(lifted.slide).toEqual(p.slide);
    expect(lifted.overrides).toEqual([
      {
        kind: 'style',
        key: { itemType: 'frage', nth: 1, role: '*' },
        props: { x: second.x, fill: '#ff0000' },
      },
    ]);
  });

  it('records deleted elements', () => {
    const p = page(deCarousel, 0);
    p.state.additionalTexts = texts(p.state).filter((t) => t.id !== 'sc-0-dachzeile');
    p.state.layerOrder = (p.state.layerOrder as string[]).filter((id) => id !== 'sc-0-dachzeile');
    expect(liftPage(p.state, p).overrides).toEqual([
      { kind: 'deleted', key: { itemType: 'dachzeile', nth: 0, role: '*' } },
    ]);
  });

  it('keeps foreign elements verbatim, anchored on the baseline element below them', () => {
    const p = page(deCarousel, 0);
    const order = p.state.layerOrder as string[];
    const below = order[2]!;
    const shape = { id: 'shape-hand-1', type: 'rect', x: 1, y: 2, width: 3, height: 4 };
    const bottom = { id: 'asset-hand-1', assetId: 'sonne', x: 0, y: 0, scale: 1 };
    const unordered = { id: 'text-hand-1', text: 'Hallo', x: 5, y: 5 };
    p.state.shapeInstances = [...(p.state.shapeInstances as unknown[]), shape];
    p.state.assetInstances = [...(p.state.assetInstances as unknown[]), bottom];
    p.state.additionalTexts = [...texts(p.state), unordered];
    p.state.layerOrder = ['asset-hand-1', ...order.slice(0, 3), 'shape-hand-1', ...order.slice(3)];

    const lifted = liftPage(p.state, p);
    const slide = p.slide.slides[0]!;
    expect(lifted.overrides).toEqual([]);
    // Bottom to top; not in the layer order: on top.
    expect(lifted.foreign).toEqual([
      { collection: 'assetInstances', id: 'asset-hand-1', element: bottom, anchor: null },
      {
        collection: 'shapeInstances',
        id: 'shape-hand-1',
        element: shape,
        anchor: elementKey(below, slide),
      },
      {
        collection: 'additionalTexts',
        id: 'text-hand-1',
        element: unordered,
        anchor: elementKey(order.at(-1)!, slide),
      },
    ]);
  });

  it('records a moved photo, and a swapped photo or colour as a background override', () => {
    const p = page(deCarousel, 0);
    p.state.imageOffset = { x: 12, y: -30 };
    p.state.imageScale = 1.2;
    expect(liftPage(p.state, p)).toMatchObject({
      overrides: [{ kind: 'background', offset: { x: 12, y: -30 }, scale: 1.2 }],
    });
    p.state.currentImageSrc = '/api/image-picker/stock-image/other.jpg';
    p.state.backgroundColor = '#123456';
    expect(liftPage(p.state, p)).toMatchObject({
      overrides: [
        {
          kind: 'background',
          offset: { x: 12, y: -30 },
          scale: 1.2,
          color: '#123456',
          imageSrc: '/api/image-picker/stock-image/other.jpg',
        },
      ],
    });
  });
});

describe('element keys', () => {
  it.each(Object.entries(SPECS))('resolve every element id of %s back to itself', (_name, spec) => {
    for (const p of pagesOf(spec)) {
      const slide = p.slide.slides[0]!;
      for (const id of Object.keys(p.baseline.elements)) {
        expect(elementIdForKey(elementKey(id, slide), slide)).toBe(id);
      }
    }
  });

  it('names by rank: an item inserted before others of its type shifts the key (accepted)', () => {
    const slide = deCarousel.slides[11]!;
    const key = elementKey('sc-1-frage', slide); // the second question, "Und Sonne?"
    const inserted = {
      ...slide,
      items: [{ type: 'frage' as const, text: 'Neu?' }, ...slide.items],
    };
    // Now the second question is the former first one, at index 1.
    expect(elementIdForKey(key, inserted)).toBe('sc-1-frage');
    expect(inserted.items[1]).toEqual(slide.items[0]);
  });

  it('follows an item to its new index', () => {
    const slide = deCarousel.slides[11]!;
    const key = elementKey('sc-1-frage', slide);
    const reordered = { ...slide, items: [slide.items[2]!, ...slide.items.slice(0, 2)] };
    expect(elementIdForKey(key, reordered)).toBe('sc-2-frage');
    expect(elementIdForKey(key, { ...slide, items: [slide.items[0]!] })).toBeNull();
    expect(elementKey('chart-sc-1-diagramm', deCarousel.slides[2]!)).toEqual({
      itemType: 'diagramm',
      nth: 0,
      role: 'chart-*',
    });
  });
});

/** The compose input of page `s`: tweaks applied on the whole deck, then cut to one slide. */
const inputOf = (deck: SharepicSpec, s: number, tweaks: SharepicTweakChoice = {}) => {
  const input = applySharepicTweaks(deck, tweaks);
  return { ...input, slides: [input.slides[s]!] };
};

/** Page `s` composed afresh from `deck` with its slide swapped for `slide`. */
const freshPage = (
  deck: SharepicSpec,
  s: number,
  slide: SharepicSlide,
  tweaks: SharepicTweakChoice = {}
) => {
  const next = { ...deck, slides: deck.slides.map((x, k) => (k === s ? slide : x)) };
  return {
    composed: composeSharepic(applySharepicTweaks(next, tweaks), options).slides[s]!,
    spec: inputOf(next, s, tweaks),
  };
};

const allIds = (state: ComposedSlide) => [
  ...state.additionalTexts.map((t) => t.id),
  ...state.pillBadgeInstances.map((t) => t.id),
  ...state.shapeInstances.map((t) => t.id),
  ...state.layerOrder,
];

describe('recomposePage', () => {
  it('keeps a hand move through a modest text change of its item', () => {
    const p = page(deCarousel, 1);
    const headline = textEl(p.state, 'sc-0-headline-0');
    headline.x += 30;
    headline.y += 10;
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[1]!;
    const fresh = freshPage(deCarousel, 1, {
      ...slide,
      items: [{ type: 'headline', lines: ['Drei Gründe', 'für Wind'] }, slide.items[1]!],
    });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 1),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([]);
    expect(textEl(out.state, 'sc-0-headline-0')).toMatchObject({
      x: headline.x,
      y: headline.y,
      text: 'Drei Gründe\nfür Wind',
    });
    // The baseline is the fresh compose, so the move reads as an edit again.
    expect(out.baseline).toEqual(fingerprint(fresh.composed));
  });

  it('drops a hand move when its item text changes by more than half, keeping the rest', () => {
    const p = page(deCarousel, 1);
    const headline = textEl(p.state, 'sc-0-headline-0');
    headline.x += 30;
    headline.fill = '#ff0000';
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[1]!;
    const fresh = freshPage(deCarousel, 1, {
      ...slide,
      items: [{ type: 'headline', lines: ['Bus und Bahn', 'ausbauen'] }, slide.items[1]!],
    });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 1),
      fresh.spec
    );
    const composedX = fresh.composed.additionalTexts.find((t) => t.id === 'sc-0-headline-0')!.x;
    expect(textEl(out.state, 'sc-0-headline-0')).toMatchObject({ x: composedX, fill: '#ff0000' });
    expect(out.droppedOverrides).toEqual([
      {
        kind: 'style',
        key: { itemType: 'headline', nth: 0, role: '*-0' },
        props: { x: headline.x },
      },
    ]);
  });

  const LAYOUT: [string, (s: SharepicSlide) => SharepicSlide, SharepicSpec, SharepicTweakChoice][] =
    [
      ['position', (s) => ({ ...s, position: 'oben' }), deCarousel, {}],
      [
        'text side',
        (s) => ({ ...s, background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'oben' } }),
        deCarousel,
        {},
      ],
      ['format', (s) => s, { ...deCarousel, format: 'post-portrait-tall' }, {}],
      ['line boxes', (s) => s, deCarousel, { zeilenboxen: 'an' }],
    ];
  it.each(LAYOUT)(
    'drops hand moves when the %s changes, and reports them',
    (_n, change, deck, tw) => {
      const p = page(deCarousel, 0);
      const dachzeile = textEl(p.state, 'sc-0-dachzeile');
      dachzeile.x += 25;
      const lifted = liftPage(p.state, p);
      const fresh = freshPage(deck, 0, change(deCarousel.slides[0]!), tw);
      const out = recomposePage(
        fresh.composed,
        lifted.overrides,
        lifted.foreign,
        inputOf(deCarousel, 0),
        fresh.spec
      );
      const composedX = fresh.composed.additionalTexts.find((t) => t.id === 'sc-0-dachzeile')!.x;
      expect(textEl(out.state, 'sc-0-dachzeile').x).toBe(composedX);
      expect(out.droppedOverrides).toEqual([
        {
          kind: 'style',
          key: { itemType: 'dachzeile', nth: 0, role: '*' },
          props: { x: dachzeile.x },
        },
      ]);
    }
  );

  it('drops headline segment overrides when the line boxes toggle', () => {
    const p = page(deCarousel, 0);
    // A new break in a segment line: a text override on `*-0`.
    textEl(p.state, 'sc-1-headline-0').text = 'Mach\nmit';
    const lifted = liftPage(p.state, p);
    expect(lifted.overrides).toHaveLength(1);
    const fresh = freshPage(deCarousel, 0, deCarousel.slides[0]!, { zeilenboxen: 'an' });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual(lifted.overrides);
    expect(JSON.stringify(out.state)).not.toContain('Mach\\nmit');
  });

  it('keeps a text override while its item is unchanged, drops it once the spec rewrites it', () => {
    const p = page(deCarousel, 0);
    textEl(p.state, 'sc-0-dachzeile').text = '';
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[0]!;
    const same = freshPage(deCarousel, 0, slide);
    const kept = recomposePage(
      same.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      same.spec
    );
    expect(textEl(kept.state, 'sc-0-dachzeile').text).toBe('');
    expect(kept.droppedOverrides).toEqual([]);

    const rewritten = freshPage(deCarousel, 0, {
      ...slide,
      items: [{ type: 'dachzeile', text: 'Klimaschutz vor Ort!' }, ...slide.items.slice(1)],
    });
    const out = recomposePage(
      rewritten.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      rewritten.spec
    );
    expect(textEl(out.state, 'sc-0-dachzeile').text).toBe('Klimaschutz vor Ort!');
    expect(out.droppedOverrides).toEqual(lifted.overrides);
  });

  describe('a hand style against the spec change', () => {
    /** Slide 2 with its headline on one long line: the composer sets it small. */
    const oneLine: SharepicSpec = {
      ...deCarousel,
      slides: deCarousel.slides.map((x, k) =>
        k === 1
          ? {
              ...x,
              items: [{ type: 'headline', lines: ['Drei Gründe für Wind und Sonne'] }, x.items[1]!],
            }
          : x
      ),
    };

    it('lets the requested change win over a hand size of the same property, and reports it', () => {
      const p = page(oneLine, 1);
      const headline = textEl(p.state, 'sc-0-headline-0') as Text & { fontSize: number };
      const composedSize = headline.fontSize;
      headline.fontSize = composedSize + 10;
      const lifted = liftPage(p.state, p);
      const slide = oneLine.slides[1]!;
      // "Überschrift größer": the same words on three lines, set large.
      const fresh = freshPage(oneLine, 1, {
        ...slide,
        items: [
          { type: 'headline', lines: ['Drei Gründe', 'für Wind', 'und Sonne'] },
          slide.items[1]!,
        ],
      });
      const freshSize = fresh.composed.additionalTexts.find(
        (t) => t.id === 'sc-0-headline-0'
      )!.fontSize;
      expect(freshSize).toBeGreaterThan(composedSize + 10);

      const out = recomposePage(
        fresh.composed,
        lifted.overrides,
        lifted.foreign,
        inputOf(oneLine, 1),
        fresh.spec,
        p.baseline
      );
      expect(textEl(out.state, 'sc-0-headline-0')).toMatchObject({ fontSize: freshSize });
      expect(out.droppedOverrides).toEqual([
        {
          kind: 'style',
          key: { itemType: 'headline', nth: 0, role: '*-0' },
          props: { fontSize: composedSize + 10 },
        },
      ]);
    });

    it('keeps a hand colour while the change touches something else', () => {
      const p = page(deCarousel, 1);
      textEl(p.state, 'sc-0-headline-0').fill = '#ff0000';
      const lifted = liftPage(p.state, p);
      const slide = deCarousel.slides[1]!;
      const fresh = freshPage(deCarousel, 1, {
        ...slide,
        items: [slide.items[0]!, { type: 'liste', items: ['Saubere Luft', 'Jobs vor Ort'] }],
      });
      const out = recomposePage(
        fresh.composed,
        lifted.overrides,
        lifted.foreign,
        inputOf(deCarousel, 1),
        fresh.spec,
        p.baseline
      );
      expect(textEl(out.state, 'sc-0-headline-0').fill).toBe('#ff0000');
      expect(out.droppedOverrides).toEqual([]);
    });
  });

  it('treats a deleted element the new spec also removed as satisfied', () => {
    const p = page(deCarousel, 0);
    p.state.additionalTexts = texts(p.state).filter((t) => !t.id.startsWith('sc-3-button'));
    p.state.pillBadgeInstances = (p.state.pillBadgeInstances as Text[]).filter(
      (t) => !t.id.startsWith('sc-3-button')
    );
    p.state.shapeInstances = (p.state.shapeInstances as Text[]).filter(
      (t) => !t.id.startsWith('sc-3-button')
    );
    const lifted = liftPage(p.state, p);
    expect(lifted.overrides.some((o) => o.kind === 'deleted')).toBe(true);
    const slide = deCarousel.slides[0]!;
    const fresh = freshPage(deCarousel, 0, { ...slide, items: slide.items.slice(0, 3) });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([]);
  });

  it('keeps deleted elements deleted', () => {
    const p = page(deCarousel, 0);
    p.state.additionalTexts = texts(p.state).filter((t) => t.id !== 'sc-0-dachzeile');
    p.state.layerOrder = (p.state.layerOrder as string[]).filter((id) => id !== 'sc-0-dachzeile');
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[0]!;
    const fresh = freshPage(deCarousel, 0, { ...slide, quelle: 'UBA 2026' });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(allIds(out.state)).not.toContain('sc-0-dachzeile');
    expect(Object.keys(out.baseline.elements)).toContain('sc-0-dachzeile');
    expect(out.droppedOverrides).toEqual([]);
  });

  it('reports overrides whose element the fresh compose no longer has', () => {
    const p = page(deCarousel, 0);
    textEl(p.state, 'sc-3-button').x += 10;
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[0]!;
    const fresh = freshPage(deCarousel, 0, { ...slide, items: slide.items.slice(0, 3) });
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual(lifted.overrides);
  });

  it('puts foreign elements back above their anchor, in their order', () => {
    const p = page(deCarousel, 0);
    const order = p.state.layerOrder as string[];
    const anchor = order[2]!;
    const button = order.find((id) => id.startsWith('sc-3-button'))!;
    const shape = { id: 'shape-hand-1', type: 'rect', x: 1, y: 2, width: 3, height: 4 };
    const text = { id: 'text-hand-1', text: 'Hallo', x: 5, y: 5 };
    const onButton = { id: 'text-hand-2', text: 'Hier', x: 6, y: 6 };
    const bottom = { id: 'asset-hand-1', assetId: 'sonne', x: 0, y: 0, scale: 1 };
    p.state.shapeInstances = [...(p.state.shapeInstances as unknown[]), shape];
    p.state.assetInstances = [...(p.state.assetInstances as unknown[]), bottom];
    p.state.additionalTexts = [...texts(p.state), text, onButton];
    const after = order.indexOf(button) + 1;
    p.state.layerOrder = [
      'asset-hand-1',
      ...order.slice(0, 3),
      'shape-hand-1',
      'text-hand-1',
      ...order.slice(3, after),
      'text-hand-2',
      ...order.slice(after),
    ];
    const lifted = liftPage(p.state, p);
    const slide = deCarousel.slides[0]!;

    const same = freshPage(deCarousel, 0, slide);
    const out = recomposePage(
      same.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      same.spec
    );
    expect(out.state.layerOrder).toEqual(p.state.layerOrder);
    expect(out.state.shapeInstances).toContainEqual(shape);
    expect(out.state.assetInstances).toContainEqual(bottom);

    // The button goes: what sat on it goes on top.
    const fresh = freshPage(deCarousel, 0, { ...slide, items: slide.items.slice(0, 3) });
    const gone = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(gone.state.layerOrder.at(-1)).toBe('text-hand-2');
    expect(gone.state.layerOrder.indexOf('shape-hand-1')).toBe(
      gone.state.layerOrder.indexOf(anchor) + 1
    );
    expect(gone.state.layerOrder[0]).toBe('asset-hand-1');
  });

  it('recomposing an unchanged spec lifts back to the same overrides and foreign', () => {
    const p = page(deCarousel, 0);
    textEl(p.state, 'sc-0-dachzeile').x += 25;
    textEl(p.state, 'sc-seite').text = 'Seite 1';
    textEl(p.state, 'sc-quelle').text = 'Quelle: BMWK 2026';
    p.state.additionalTexts = texts(p.state).filter((t) => t.id !== 'sc-2-text');
    p.state.shapeInstances = [
      ...(p.state.shapeInstances as unknown[]),
      { id: 'shape-hand-1', type: 'rect', x: 1, y: 2, width: 3, height: 4 },
    ];
    p.state.layerOrder = ['shape-hand-1', ...(p.state.layerOrder as string[])];
    p.state.imageOffset = { x: 12, y: -30 };
    const lifted = liftPage(p.state, p);
    expect(lifted.overrides.map((o) => o.kind).sort()).toEqual([
      'background',
      'deleted',
      'style',
      'text',
    ]);

    const fresh = freshPage(deCarousel, 0, lifted.slide.slides[0]!);
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(lifted.slide, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([]);
    const again = liftPage(stateOf(out.state), { slide: lifted.slide, baseline: out.baseline });
    expect(again).toEqual(lifted);
  });

  it('carries a hand move and a hand text through a spec change on a real Yjs page', async () => {
    const base = deCarousel;
    const config = await loadCanvasConfig('freeform', 'post-portrait');
    const pages = pagesOf(base);
    const toYjs = (states: Record<string, unknown>[]) => {
      const sent = new Y.Doc();
      seedPagesIfEmpty(
        sent,
        states.map((state, s) => ({ id: `p${s}`, configId: 'freeform', state }))
      );
      const received = new Y.Doc();
      Y.applyUpdate(received, Y.encodeStateAsUpdate(sent));
      return serializeDeck(received).map((pg) => pg.state);
    };
    const states = toYjs(
      pages.map((p) => config.createInitialState(p.composed) as Record<string, unknown>)
    );
    const p = pages[1]!;
    const state = states[1]!;
    const own = (id: string) =>
      (state.additionalTexts as { id: string; x: number; y: number; text: string }[]).find(
        (t) => t.id === id
      )!;
    own('sc-0-headline-0').x += 30;
    own('sc-0-headline-0').y += 10;
    own('sc-1-liste').text = '• Saubere Luft\n• Jobs\n• Mehr Rad';
    const order = state.layerOrder as string[];
    state.shapeInstances = [
      ...(state.shapeInstances as unknown[]),
      { id: 'shape-hand-1', type: 'rect', x: 1, y: 2, width: 3, height: 4 },
    ];
    state.assetInstances = [
      ...(state.assetInstances as unknown[]),
      { id: 'asset-hand-1', assetId: 'sonne', x: 0, y: 0, scale: 1 },
    ];
    const at = order.indexOf('sc-0-headline-0');
    state.layerOrder = [
      'asset-hand-1',
      ...order.slice(0, at + 1),
      'shape-hand-1',
      ...order.slice(at + 1),
    ];
    const moved = { x: own('sc-0-headline-0').x, y: own('sc-0-headline-0').y };

    const lifted = liftPage(state, p);
    const liftedSlide = lifted.slide.slides[0]!;
    expect(liftedSlide.items[1]).toEqual({
      type: 'liste',
      items: ['Saubere Luft', 'Jobs', 'Mehr Rad'],
    });
    // The spec shortens the headline.
    const changed: SharepicSlide = {
      ...liftedSlide,
      items: [{ type: 'headline', lines: ['Drei Gründe', 'für Wind'] }, liftedSlide.items[1]!],
    };
    const fresh = freshPage(base, 1, changed);
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf({ ...base, slides: base.slides.map((x, k) => (k === 1 ? liftedSlide : x)) }, 1),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([]);

    const [next] = toYjs([config.createInitialState(out.state) as Record<string, unknown>]);
    const nextText = (id: string) =>
      (next!.additionalTexts as { id: string; x: number; y: number; text: string }[]).find(
        (t) => t.id === id
      )!;
    expect(nextText('sc-0-headline-0')).toMatchObject({ ...moved, text: 'Drei Gründe\nfür Wind' });
    expect(nextText('sc-1-liste').text).toBe('• Saubere Luft\n• Jobs\n• Mehr Rad');
    const nextOrder = next!.layerOrder as string[];
    expect(nextOrder[0]).toBe('asset-hand-1');
    expect(nextOrder[nextOrder.indexOf('sc-0-headline-0') + 1]).toBe('shape-hand-1');
    // And the next lift sees the same hand edits again.
    const again = liftPage(next!, {
      slide: { ...fresh.spec, slides: [changed] },
      baseline: out.baseline,
    });
    expect(again.overrides).toEqual(lifted.overrides);
    expect(again.foreign).toEqual(lifted.foreign);
  });
});

describe('recomposePage hand background', () => {
  const handBackground = () => {
    const p = page(deCarousel, 0);
    p.state.currentImageSrc = '/api/image-picker/stock-image/other.jpg';
    p.state.backgroundColor = '#123456';
    p.state.imageScale = 1.3;
    return liftPage(p.state, p);
  };

  it('keeps a swapped photo and colour while the background spec stays', () => {
    const lifted = handBackground();
    const changed = { ...deCarousel.slides[0]!, quelle: 'Umweltbundesamt 2026' };
    const fresh = freshPage(deCarousel, 0, changed);
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([]);
    expect(out.state).toMatchObject({
      currentImageSrc: '/api/image-picker/stock-image/other.jpg',
      backgroundColor: '#123456',
      imageScale: 1.3,
    });
  });

  it('reports a swapped photo once the spec changes the background', () => {
    const lifted = handBackground();
    const changed = {
      ...deCarousel.slides[0]!,
      background: { kind: 'foto' as const, filename: 'sonne.jpg', textSeite: 'unten' as const },
    };
    const fresh = freshPage(deCarousel, 0, changed);
    const out = recomposePage(
      fresh.composed,
      lifted.overrides,
      lifted.foreign,
      inputOf(deCarousel, 0),
      fresh.spec
    );
    expect(out.droppedOverrides).toEqual([
      {
        kind: 'background',
        scale: 1.3,
        color: '#123456',
        imageSrc: '/api/image-picker/stock-image/other.jpg',
      },
    ]);
    expect(out.state.currentImageSrc).toBe(fresh.composed.currentImageSrc);
    expect(out.state.backgroundColor).toBe(fresh.composed.backgroundColor);
  });
});
