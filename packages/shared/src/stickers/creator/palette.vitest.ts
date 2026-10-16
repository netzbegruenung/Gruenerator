import { describe, expect, it } from 'vitest';

import { BADGE_DEFAULT_COLORS, sameColor, stickerSwatches, swatchColor } from './palette';

describe('sticker palette', () => {
  it.each(['de-DE', 'de-AT'] as const)('%s defaults to two different palette colours', (locale) => {
    const swatches = stickerSwatches(locale);
    const { background, text } = BADGE_DEFAULT_COLORS[locale];
    expect(swatches.map((s) => s.id)).toEqual(expect.arrayContaining([background, text]));
    expect(sameColor(swatchColor(swatches, background), swatchColor(swatches, text))).toBe(false);
  });

  it('offers only flat colours', () => {
    expect(stickerSwatches('de-DE').every((s) => /^#[0-9a-f]{6}$/i.test(s.color))).toBe(true);
  });

  it('compares colours case-insensitively', () => {
    expect(sameColor('#FFFFFF', '#ffffff')).toBe(true);
  });
});
