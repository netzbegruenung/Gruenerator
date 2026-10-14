/**
 * A point typed by hand into a creator list grows the white card behind it.
 * Before, the card kept the composer's height until an AI edit recomposed the
 * page, and the new point hung below it.
 */
import { layoutRichTextBlock, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { createFreeformFullConfig, type FreeformState } from '../configs/freeform_full.config';
import { getCanvasFormatOrDefault } from '../formats';
import { runMeasurer } from '../utils/textUtils';

import { composeSharepic } from './composeSharepic';
import { fingerprint, liftPage, recomposePage } from './liftSharepicPage';
import { farbe, options } from './sharepicSpecFixtures';

import type { AdditionalText } from '../configs/types';
import type { ShapeInstance } from '../utils/shapes';

const specOf = (headline: string, items: string[]): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    farbe('tanne', [
      { type: 'headline', lines: [headline] },
      { type: 'liste', items },
    ]),
  ],
});
const spec = specOf('Darum', ['Saubere Luft', 'Günstiger Strom', 'Jobs']);
const compose = (s: SharepicSpec) =>
  composeSharepic(s, { ...options, provenance: true }).slides[0]!;

function creatorList() {
  const slide = compose(spec);
  const source = { slide: spec, baseline: fingerprint(slide) };
  // As in the editor: the source lives in the Yjs page state, not in the config's state.
  let state = structuredClone(slide) as unknown as FreeformState;
  const setState = (u: Partial<FreeformState> | ((prev: FreeformState) => FreeformState)) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const config = createFreeformFullConfig(getCanvasFormatOrDefault(null));
  const actions = config.createActions(() => state, setState, noop, noop, {});
  const list = (state.additionalTexts as AdditionalText[]).find((t) => t.text.startsWith('•'))!;
  // Boundary cast: FreeformActions is Record<string, any>.
  const update = actions.updateAdditionalText as (id: string, p: Partial<AdditionalText>) => void;
  return { update, getState: () => state, list, source };
}

const bottomOf = (t: AdditionalText) => {
  const measure = runMeasurer(t.fontSize, t.fontFamily, t.fontStyle ?? 'normal', 0, t.accent);
  return t.y + layoutRichTextBlock(t.text, t.width, measure).length * t.fontSize * t.lineHeight!;
};
const cardOf = (state: FreeformState, id: string) =>
  (state.shapeInstances as ShapeInstance[]).find((s) => s.id === `${id}-card`)!;
const cardBottom = (c: ShapeInstance) => c.y + (c.height * c.scaleY) / 2;
const cardTop = (c: ShapeInstance) => c.y - (c.height * c.scaleY) / 2;

describe('a creator list card follows a hand edit', () => {
  it('grows with a typed fourth point, keeping its top and its padding below', () => {
    const { update, getState, list } = creatorList();
    const before = cardOf(getState(), list.id);
    const padBelow = cardBottom(before) - bottomOf(list);

    update(list.id, { text: `${list.text}\n• Mehr Bahn` });

    const text = (getState().additionalTexts as AdditionalText[]).find((t) => t.id === list.id)!;
    const after = cardOf(getState(), list.id);
    expect(cardTop(after)).toBeCloseTo(cardTop(before), 5);
    expect(cardBottom(after) - bottomOf(text)).toBeCloseTo(padBelow, 5);
  });

  it('is not read as a hand-styled card by the next lift', () => {
    const { update, getState, list, source } = creatorList();
    update(list.id, { text: `${list.text}\n• Mehr Bahn` });

    const lifted = liftPage(getState() as unknown as Record<string, unknown>, source);
    expect(lifted.overrides.filter((o) => o.kind === 'style')).toEqual([]);
    expect(lifted.slide.slides[0]!.items[1]).toMatchObject({
      type: 'liste',
      items: ['Saubere Luft', 'Günstiger Strom', 'Jobs', 'Mehr Bahn'],
    });
  });

  it('takes the composer height on the next recompose', () => {
    const { update, getState, list, source } = creatorList();
    update(list.id, { text: `${list.text}\n• Mehr Bahn` });
    const lifted = liftPage(getState() as unknown as Record<string, unknown>, source);
    const items = ['Saubere Luft', 'Günstiger Strom', 'Jobs', 'Mehr Bahn'];
    const next = specOf('Was wir fordern', items);
    const fresh = compose(next);

    // applySpecEdit judges a restyled page against the compose of the lifted spec.
    const previousBaseline = fingerprint(compose(lifted.slide));
    const page = recomposePage(
      fresh,
      lifted.overrides,
      lifted.foreign,
      lifted.slide,
      next,
      previousBaseline
    );

    expect(cardOf(page.state as unknown as FreeformState, list.id).height).toBe(
      cardOf(fresh as unknown as FreeformState, list.id).height
    );
  });

  it('keeps a card resized by hand after it grew', () => {
    const { update, getState, list, source } = creatorList();
    update(list.id, { text: `${list.text}\n• Mehr Bahn` });
    const card = cardOf(getState(), list.id);
    card.height += 100;

    const lifted = liftPage(getState() as unknown as Record<string, unknown>, source);
    expect(lifted.overrides).toContainEqual(
      expect.objectContaining({
        kind: 'style',
        props: expect.objectContaining({ height: card.height }),
      })
    );
  });
});
