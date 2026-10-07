import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';
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
} from './liftSharepicPage';
import { deCarousel, gruende, MORE_SPECS, options, SPECS } from './sharepicSpecFixtures';
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
const texts = (state: State) => state.additionalTexts as { id: string; text: string; x: number }[];
const textEl = (state: State, id: string) => {
  const found =
    texts(state).find((t) => t.id === id) ??
    (state.pillBadgeInstances as { id: string; text: string; x: number }[]).find(
      (p) => p.id === id
    );
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
  it.each(CASES)('round-trips an untouched page of %s unchanged', (_name, base, tweaks) => {
    for (const p of pagesOf(base, tweaks)) {
      const lifted = liftPage(stateOf(p.composed), { slide: p.slide, baseline: p.baseline });
      expect(lifted).toEqual({ slide: p.slide, overrides: [], foreign: [], unliftable: [] });
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
          unliftable: [],
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
    expect(lifted.foreign).toEqual([
      {
        collection: 'additionalTexts',
        id: 'text-hand-1',
        element: unordered,
        anchor: elementKey(order.at(-1)!, slide),
      },
      {
        collection: 'shapeInstances',
        id: 'shape-hand-1',
        element: shape,
        anchor: elementKey(below, slide),
      },
      { collection: 'assetInstances', id: 'asset-hand-1', element: bottom, anchor: null },
    ]);
  });

  it('records a moved photo and reports a swapped background as unliftable', () => {
    const p = page(deCarousel, 0);
    p.state.imageOffset = { x: 12, y: -30 };
    p.state.imageScale = 1.2;
    expect(liftPage(p.state, p)).toMatchObject({
      overrides: [{ kind: 'background', offset: { x: 12, y: -30 }, scale: 1.2 }],
      unliftable: [],
    });
    p.state.currentImageSrc = '/api/image-picker/stock-image/other.jpg';
    expect(liftPage(p.state, p).unliftable).toEqual(['background']);
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
