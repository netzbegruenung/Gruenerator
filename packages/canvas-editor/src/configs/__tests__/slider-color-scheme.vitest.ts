/**
 * Der Slider ist die einzige Config, die `props.colorScheme` liest — und
 * `initial_state` ist kein typisierter Kanal. Ein frisch geprägter Canvas
 * bekam von `canvasMintService` die Studio-Palette (`{background}[]`) unter
 * diesem Schlüssel; sie ist wahrheitswertig, also griff der alte
 * `|| 'sand-tanne'`-Rückfall nicht, `getSliderColors` lieferte `undefined`
 * und `colors.arrowFill` riss den ganzen Render mit (GlitchTip #563).
 *
 * Geprüft wird deshalb an der Zugehörigkeit, nicht am Wahrheitswert.
 */
import { describe, expect, it } from 'vitest';

import { sliderFullConfig } from '../slider_full.config';

import {
  DEFAULT_SLIDER_COLOR_SCHEME,
  getSliderColors,
  isSliderColorScheme,
} from '../../utils/sliderLayout';

const STUDIO_PALETTE = [
  { background: '#005538' },
  { background: '#F5F1E9' },
  { background: '#F5F1E9' },
];

describe('getSliderColors', () => {
  it('liefert für jeden fremden Wert ein vollständiges Farbset', () => {
    for (const bogus of [STUDIO_PALETTE, 'gruen-weiss', '', null, undefined, 42, {}]) {
      const colors = getSliderColors(bogus as never);
      expect(colors, `getSliderColors(${JSON.stringify(bogus)})`).toBeDefined();
      expect(colors.arrowFill).toEqual(expect.any(String));
      expect(colors.headlineText).toEqual(expect.any(String));
    }
  });

  it('lässt die echten Schemata unangetastet', () => {
    expect(getSliderColors('tanne-sand').arrowFill).toBe('#F5F1E9');
    expect(getSliderColors('sand-tanne').arrowFill).toBe('#005538');
  });
});

describe('isSliderColorScheme', () => {
  it('nimmt nur die bekannten Ids', () => {
    expect(isSliderColorScheme('sand-tanne')).toBe(true);
    expect(isSliderColorScheme('tanne-sand')).toBe(true);
    expect(isSliderColorScheme(STUDIO_PALETTE)).toBe(false);
    expect(isSliderColorScheme('toString')).toBe(false);
  });
});

describe('slider createInitialState', () => {
  it('überlebt die Studio-Palette und fällt auf das Standardschema zurück', () => {
    const state = sliderFullConfig.createInitialState({
      colorScheme: STUDIO_PALETTE,
      fontSize: 1,
      label: 'Wusstest du?',
      headline: 'Kopfzeile',
      subtext: 'Untertext',
    }) as Record<string, unknown>;

    expect(state.colorScheme).toBe(DEFAULT_SLIDER_COLOR_SCHEME);
    const icons = state.iconStates as Record<string, { color: string }>;
    expect(Object.values(icons).every((icon) => typeof icon.color === 'string')).toBe(true);
  });

  it('übernimmt ein echtes Schema weiterhin', () => {
    const state = sliderFullConfig.createInitialState({
      colorScheme: 'tanne-sand',
      headline: 'Kopfzeile',
    }) as Record<string, unknown>;

    expect(state.colorScheme).toBe('tanne-sand');
  });
});
