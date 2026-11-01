/**
 * A font picked by role re-fits the text box: the freeform config's `updateAdditionalText` hands
 * the whole change (not only `text`) to `withCardFollowingText`, so a family that wraps the same
 * words in more lines grows the card behind them.
 */
import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import { layoutRichTextBlock } from '@ggraphic/schema';
import { type SharepicSpec } from '@gruenerator/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type FreeformState } from '../configs/freeform_full.config';

import { composeSharepic } from './composeSharepic';
import { farbe, options } from './sharepicSpecFixtures';

import type { AdditionalText } from '@ggraphic/editor/configs/types';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';

const spec: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    farbe('tanne', [
      { type: 'headline', lines: ['Darum'] },
      { type: 'liste', items: ['Saubere Luft', 'Günstiger Strom', 'Jobs'] },
    ]),
  ],
};

const width = (fontSize: number, fontFamily: string) => (text: string) =>
  text.length * fontSize * (fontFamily.startsWith('Wide') ? 0.9 : 0.3);

/**
 * The config with a measure that depends on the family ("Wide" is three times as wide as the
 * rest). Mocked per test and reset after: the node lane shares modules between files.
 */
async function creatorList() {
  vi.resetModules();
  vi.doMock('@ggraphic/editor/utils/textUtils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@ggraphic/editor/utils/textUtils')>()),
    runMeasurer: width,
  }));
  const { createFreeformFullConfig } = await import('../configs/freeform_full.config');
  let state = structuredClone(
    composeSharepic(spec, { ...options, provenance: true }).slides[0]!
  ) as unknown as FreeformState;
  const setState = (u: Partial<FreeformState> | ((prev: FreeformState) => FreeformState)) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const config = createFreeformFullConfig(getCanvasFormatOrDefault(null));
  const actions = config.createActions(() => state, setState, noop, noop, {});
  const list = (state.additionalTexts as AdditionalText[]).find((t) => t.text.startsWith('•'))!;
  const update = actions.updateAdditionalText as (id: string, p: Partial<AdditionalText>) => void;
  return { update, getState: () => state, list };
}

const card = (state: FreeformState, id: string) =>
  (state.shapeInstances as ShapeInstance[]).find((s) => s.id === `${id}-card`)!;

afterEach(() => {
  vi.doUnmock('@ggraphic/editor/utils/textUtils');
  vi.resetModules();
});

describe('a font role picked by hand re-fits the text box', () => {
  it('grows the card behind a text whose new family wraps in more lines', async () => {
    const { update, getState, list } = await creatorList();
    const before = card(getState(), list.id);
    const lines = (t: AdditionalText) =>
      layoutRichTextBlock(t.text, t.width, width(t.fontSize, t.fontFamily)).length;
    expect(lines({ ...list, fontFamily: 'Wide Sans' })).toBeGreaterThan(lines(list));

    update(list.id, {
      fontFamily: 'Wide Sans',
      bind: { fontFamily: { ref: 'font.quoteEmphasis', value: 'Wide Sans' } },
    });

    const text = (getState().additionalTexts as AdditionalText[]).find((t) => t.id === list.id)!;
    expect(text.fontFamily).toBe('Wide Sans');
    expect(text.bind).toEqual({ fontFamily: { ref: 'font.quoteEmphasis', value: 'Wide Sans' } });
    expect(card(getState(), list.id).height).toBeGreaterThan(before.height);
  });
});
