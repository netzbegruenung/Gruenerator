import { sharepicBlockSpec, sharepicSpecSchema } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createFreeformFullConfig, type FreeformState } from '../configs/freeform_full.config';
import { getCanvasFormatOrDefault } from '../formats';

import { SHAREPIC_COLOR_HEX } from './chromeParts';
import { composeSharepic } from './composeSharepic';
import {
  blockElementIds,
  blockGround,
  liftBlock,
  placeBlock,
  translateBlock,
  type LiftedBlock,
} from './liftBlock';
import { farbe, options } from './sharepicSpecFixtures';

import type { AdditionalText } from '../configs/types';
import type { ShapeInstance } from '../utils/shapes';
import type { SharepicSlide } from '@gruenerator/contracts';

const slideOf = (locale: 'de-DE' | 'de-AT', items: SharepicSlide['items']) =>
  composeSharepic(
    { locale, slides: [farbe(locale === 'de-DE' ? 'tanne' : 'dunkelgruen', items)] },
    { ...options, kiLabel: false }
  ).slides[0]!;

const allIds = (block: ReturnType<typeof liftBlock>) => blockElementIds(block);

describe('liftBlock', () => {
  const listSlide = slideOf('de-DE', [
    { type: 'headline', lines: ['Unsere Forderungen'] },
    { type: 'liste', stil: 'pfeile', items: ['Mehr Busse am Abend', 'Radwege ausbauen'] },
  ]);

  it('takes only the chosen item and re-prefixes every id', () => {
    const block = liftBlock(listSlide, [1], 't1');
    const ids = allIds(block);
    expect(ids.length).toBeGreaterThan(2);
    expect(ids.every((id) => id.startsWith('blk-t1-liste'))).toBe(true);
    expect(ids.some((id) => id.startsWith('sc-'))).toBe(false);
    expect(block.additionalTexts.some((t) => t.text.includes('Unsere Forderungen'))).toBe(false);
  });

  it('keeps a card bound to its text by the id suffix', () => {
    const block = liftBlock(listSlide, [1], 't1');
    const cards = block.shapeInstances.filter((s) => s.id.endsWith('-card'));
    expect(cards.length).toBeGreaterThan(0);
    const texts = new Set(block.additionalTexts.map((t) => t.id));
    for (const card of cards) {
      const owner = card.id.slice(0, -'-card'.length);
      // The card belongs to a text, or to the item as a whole (`<item>-card`).
      expect(texts.has(owner) || owner === 'blk-t1-liste').toBe(true);
    }
  });

  it('copies, never shares, the composed elements', () => {
    const block = liftBlock(listSlide, [1], 't1');
    block.additionalTexts[0]!.x = -999;
    expect(listSlide.additionalTexts.some((t) => t.x === -999)).toBe(false);
  });

  it('renames a chart and its own prefix', () => {
    const slide = slideOf('de-DE', [
      {
        type: 'diagramm',
        art: 'linie',
        titel: 'Jobs',
        einheit: 'Tsd.',
        werte: [
          { name: '2024', wert: 4 },
          { name: '2025', wert: 5 },
        ],
      },
    ]);
    const block = liftBlock(slide, [0], 'c');
    expect(block.chartInstances.map((c) => c.id)).toEqual(['chart-blk-c-diagramm']);
  });

  it('brings an emoji list with its emoji images', () => {
    const slide = slideOf('de-AT', [
      {
        type: 'liste',
        stil: 'emoji',
        zeichen: ['🌱', '🚲'],
        items: ['Bäume pflanzen', 'Radwege bauen'],
      },
    ]);
    const block = liftBlock(slide, [0], 'e');
    expect(block.assetInstances.length).toBe(2);
    expect(block.assetInstances.every((a) => a.id.startsWith('blk-e-'))).toBe(true);
  });

  it('renames icon states with their keys', () => {
    const slide = slideOf('de-AT', [
      {
        type: 'iconliste',
        zeilen: [
          { icon: 'bus', text: 'Ein **Bus** im Stundentakt' },
          { icon: 'sonne', text: '**Sonnenstrom** auf jedem Dach' },
        ],
      },
    ]);
    const block = liftBlock(slide, [0], 'i');
    expect(block.selectedIcons.length).toBeGreaterThan(0);
    expect(Object.keys(block.iconStates)).toEqual(block.selectedIcons);
    expect(block.selectedIcons.every((id) => id.startsWith('blk-i-'))).toBe(true);
  });

  it('gives two lifts of one slide disjoint ids', () => {
    const a = new Set(allIds(liftBlock(listSlide, [1], 'a')));
    expect(allIds(liftBlock(listSlide, [1], 'b')).some((id) => a.has(id))).toBe(false);
  });
});

describe('placeBlock', () => {
  const block = liftBlock(
    slideOf('de-DE', [
      { type: 'liste', stil: 'haken', items: ['Deutschlandticket', 'Solarstrom'] },
    ]),
    [0],
    'p'
  );
  const canvas = { width: 1080, height: 1350 };

  it('has bounds around its elements', () => {
    expect(block.bounds.width).toBeGreaterThan(100);
    expect(block.bounds.height).toBeGreaterThan(50);
  });

  it('centres the block on the point', () => {
    const placed = placeBlock(block, { x: 540, y: 600 }, canvas);
    expect(placed.bounds.x + placed.bounds.width / 2).toBeCloseTo(540);
    expect(placed.bounds.y + placed.bounds.height / 2).toBeCloseTo(600);
  });

  it('keeps the block inside the composer margin', () => {
    const corner = placeBlock(block, { x: 1070, y: 1340 }, canvas);
    expect(corner.bounds.x + corner.bounds.width).toBeCloseTo(1080 - 70);
    expect(corner.bounds.y + corner.bounds.height).toBeCloseTo(1350 - 70);
    const other = placeBlock(block, { x: 0, y: 0 }, canvas);
    expect(other.bounds.x).toBeCloseTo(70);
    expect(other.bounds.y).toBeCloseTo(70);
  });

  it('moves every element by the same amount', () => {
    const moved = translateBlock(block, 10, -20);
    expect(moved.additionalTexts[0]!.x).toBe(block.additionalTexts[0]!.x + 10);
    expect(moved.shapeInstances[0]!.y).toBe(block.shapeInstances[0]!.y - 20);
  });
});

describe('insertBlock on a freeform page', () => {
  function page() {
    const slide = slideOf('de-DE', [{ type: 'headline', lines: ['Schon da'] }]);
    let state = structuredClone(slide) as unknown as FreeformState;
    const setState = (u: Partial<FreeformState> | ((prev: FreeformState) => FreeformState)) => {
      state = typeof u === 'function' ? u(state) : { ...state, ...u };
    };
    const saveToHistory = vi.fn();
    const config = createFreeformFullConfig(getCanvasFormatOrDefault(null));
    const actions = config.createActions(() => state, setState, saveToHistory, vi.fn(), {});
    // Boundary cast: FreeformActions is Record<string, any>.
    const insert = actions.insertBlock as (block: LiftedBlock) => void;
    return { actions, insert, saveToHistory, getState: () => state };
  }
  const block = liftBlock(
    slideOf('de-DE', [{ type: 'liste', items: ['Mehr Busse', 'Radwege'] }]),
    [0],
    'x'
  );

  it('adds every part on top of the page as one history entry', () => {
    const { insert, saveToHistory, getState } = page();
    const before = getState();
    insert(block);
    const after = getState();
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(after.additionalTexts).toHaveLength(
      before.additionalTexts.length + block.additionalTexts.length
    );
    expect(after.layerOrder.slice(-block.layerOrder.length)).toEqual(block.layerOrder);
    expect(after.additionalTexts.slice(0, before.additionalTexts.length)).toEqual(
      before.additionalTexts
    );
  });

  it('keeps the card following its text once inserted', () => {
    const { actions, insert, getState } = page();
    insert(block);
    const card = (getState().shapeInstances as ShapeInstance[]).find(
      (s) => s.id === 'blk-x-liste-card'
    )!;
    const text = (getState().additionalTexts as AdditionalText[]).find(
      (t) => t.id === 'blk-x-liste'
    )!;
    const update = actions.updateAdditionalText as (id: string, p: Partial<AdditionalText>) => void;
    update(text.id, { text: `${text.text}\n• Noch ein Punkt\n• Und noch einer` });
    const grown = (getState().shapeInstances as ShapeInstance[]).find((s) => s.id === card.id)!;
    expect(grown.height).toBeGreaterThan(card.height);
  });
});

describe('blockGround', () => {
  it('composes on the page colour when it is a brand colour of the country', () => {
    expect(
      blockGround('de-DE', { backgroundMode: 'color', backgroundColor: '#005538' }, 'mint')
    ).toBe('tanne');
  });

  it('sets text light on a photo', () => {
    expect(blockGround('de-DE', { backgroundMode: 'image' }, 'mint')).toBe('tanne');
    expect(blockGround('de-AT', { backgroundMode: 'image' }, 'weiss')).toBe('dunkelgruen');
  });

  it('composes on a themed ground, which brings its thema', () => {
    const ground = blockGround(
      'de-AT',
      { backgroundMode: 'color', backgroundColor: SHAREPIC_COLOR_HEX.lila },
      'weiss'
    );
    expect(ground).toBe('lila');
    const spec = sharepicBlockSpec('de-AT', {
      color: ground,
      items: [{ type: 'absatz', text: 'Gleicher Lohn.' }],
    });
    expect(sharepicSpecSchema.parse(spec).thema).toBe('frauen');
  });

  it('keeps the preview ground on a free or a foreign colour', () => {
    expect(
      blockGround('de-DE', { backgroundMode: 'color', backgroundColor: '#123456' }, 'mint')
    ).toBe('mint');
  });
});
