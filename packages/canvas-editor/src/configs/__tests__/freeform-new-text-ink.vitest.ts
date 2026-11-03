import { contrastRatio } from '@ggraphic/core';
import { loadCanvasConfig, type AdditionalText } from '@ggraphic/editor/config';
import { beforeAll, describe, expect, it } from 'vitest';

import { SHAREPIC_COLOR_HEX } from '../../composer/composeSharepic';

/**
 * A text added from the sidebar took one fixed colour, white, chosen for the
 * default Tanne sheet. The GRÜNE JUGEND sheet starts on Limette, so the new
 * text was white on light green and could not be found; the same on any light
 * colour picked in the other freeform designs.
 */

type State = Record<string, unknown> & {
  additionalTexts: AdditionalText[];
  iconStates: Record<string, { color?: string }>;
};

/** Newly added text must read at least as well as large text needs (WCAG 3:1). */
const READABLE = 3;

describe.each(['freeform', 'freeform-at', 'freeform-gj', 'freeform-gj-at'] as const)(
  '%s: a newly added text',
  (id) => {
    let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
    beforeAll(async () => {
      config = await loadCanvasConfig(id);
    }, 120_000);

    const addTextOn = (props: Record<string, unknown>) => {
      let state = config.createInitialState(props) as State;
      const actions = config.createActions(
        () => state,
        (partial) => {
          state =
            typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
        },
        () => {},
        () => {},
        {}
      ) as Record<string, () => void>;
      actions.addText!();
      return state.additionalTexts.at(-1)!;
    };

    it.each(['#ffffff', '#000000', SHAREPIC_COLOR_HEX.limette, SHAREPIC_COLOR_HEX.tanne])(
      'is readable on %s',
      (backgroundColor) => {
        const text = addTextOn({ backgroundMode: 'color', backgroundColor });
        expect(contrastRatio(backgroundColor, text.fill!)).toBeGreaterThanOrEqual(READABLE);
      }
    );

    it('is readable on the sheet it starts on', () => {
      const state = config.createInitialState({}) as State & { backgroundColor: string };
      const text = addTextOn({});
      expect(contrastRatio(state.backgroundColor, text.fill!)).toBeGreaterThanOrEqual(READABLE);
    });
  }
);

describe('sticker', () => {
  it('keeps its fixed Tanne text on the transparent sheet', async () => {
    const config = await loadCanvasConfig('sticker');
    let state = config.createInitialState({ backgroundColor: '#ffffff' }) as State;
    const actions = config.createActions(
      () => state,
      (partial) => {
        state =
          typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
      },
      () => {},
      () => {},
      {}
    ) as Record<string, () => void>;
    actions.addText!();
    expect(state.additionalTexts.at(-1)!.fill?.toLowerCase()).toBe('#005538');
  }, 120_000);
});
