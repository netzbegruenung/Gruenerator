import { describe, expect, it } from 'vitest';

import { INFO_AT_CONFIG } from '../utils/infoAtLayout';
import { SLIDER_AT_STYLE } from '../utils/sliderLayout';

import { getBrandTheme, surfaceGlow } from './theme';

/** WCAG 2.2 contrast ratio of two `#RRGGBB` colours. */
const contrast = (a: string, b: string) => {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const AT = getBrandTheme('de-AT');
/** Every colour the plane is drawn in: the glow's stops, or the flat colour. */
const rendered = (background: string) => [...(surfaceGlow(background) ?? [background])];
/** WCAG large text: 18 pt = 24 px at the 1080 px export. */
const LARGE_TEXT_PX = 24;

describe('de-AT contrast', () => {
  it.each(AT.backgroundColors.map((c) => [c.id, c.color] as const))(
    'derived text on the %s template plane reaches 4.5:1',
    (_id, background) => {
      const ink = AT.textColorMap[background]!;
      for (const stop of rendered(background)) {
        expect(contrast(stop, ink), `${ink} on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it.each(Object.entries(SLIDER_AT_STYLE.colorSchemes))(
    'slider scheme %s: text 4.5:1, arrow 3:1',
    (_id, scheme) => {
      for (const stop of rendered(scheme.background)) {
        expect(contrast(stop, scheme.headlineText)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(stop, scheme.subtextText)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(stop, scheme.arrowFill)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(scheme.pillBackground, scheme.pillText)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('info-at: the yellow closing line is large text and reaches 3:1 on every plane', () => {
    // The closing line shares the info text's scale, which never drops below
    // `minFontSize` — so it is large text, where 3:1 suffices.
    expect(INFO_AT_CONFIG.text.minFontSize).toBeGreaterThanOrEqual(LARGE_TEXT_PX);
    for (const { color } of AT.backgroundColors) {
      for (const stop of rendered(color)) {
        expect(contrast(stop, INFO_AT_CONFIG.accent.color)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the stored Hellgrün swatch, drawn as the glow', () => {
    expect(AT.backgroundColors.map((c) => c.color)).toContain('#56af31');
    expect(surfaceGlow('#56af31')).not.toBeNull();
    expect(surfaceGlow('#56AF31')).toEqual(surfaceGlow('#56af31'));
    expect(surfaceGlow(AT.colors.primary)).toBeNull();
  });
});

describe.each(['de-DE', 'de-AT'] as const)('%s accent on light ground', (locale) => {
  it('reaches 4.5:1 on white', () => {
    const { accentOnLight } = getBrandTheme(locale).colors;
    expect(contrast(accentOnLight, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
