import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic, type ComposedSlide } from './composeSharepic';
import {
  baselineProvenance,
  elementIdForKey,
  elementKey,
  fingerprint,
  liftPage,
} from './liftSharepicPage';
import { deCarousel, options, SPECS } from './sharepicSpecFixtures';
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
];
const CASES: [string, SharepicSpec, SharepicTweakChoice][] = [
  ...Object.entries(SPECS).map(([name, spec]): [string, SharepicSpec, SharepicTweakChoice] => [
    name,
    spec,
    {},
  ]),
  ...TWEAKED,
];

describe('liftPage', () => {
  it.each(CASES)('round-trips an untouched page of %s unchanged', (_name, base, tweaks) => {
    for (const p of pagesOf(base, tweaks)) {
      const lifted = liftPage(stateOf(p.composed), { slide: p.slide, baseline: p.baseline });
      expect(lifted).toEqual({ slide: p.slide, overrides: [], foreign: [], unliftable: [] });
    }
  });

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
