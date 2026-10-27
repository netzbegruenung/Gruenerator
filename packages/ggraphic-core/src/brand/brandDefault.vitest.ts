// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault';

const WHITE = '#FFFFFF';
// The families the core may ship itself: all under the SIL Open Font License.
const OPEN_FAMILIES = ['PT Sans', 'Raleway', 'Vollkorn'];

const channel = (hex: string, at: number) => {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
/** WCAG 2.2 contrast ratio of two #RRGGBB colours. */
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('brandDefault', () => {
  it('starts a design on one of its own grounds', () => {
    expect(brandDefault.backgrounds.map((ground) => ground.color)).toContain(
      brandDefault.defaultBackground
    );
  });

  it('keeps ground ids unique, since documents store them', () => {
    const ids = brandDefault.backgrounds.map((ground) => ground.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets the ink of every ground at 4.5:1 or more', () => {
    for (const ground of brandDefault.backgrounds) {
      expect(contrast(ground.ink, ground.color), ground.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text, emphasis and the attention badge at 4.5:1 or more', () => {
    const { colors } = brandDefault;
    expect(contrast(colors.textOnDark, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accent, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textOnLight, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accentOnLight, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textOnDark, colors.attention)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps swatch ids unique within each picker', () => {
    for (const swatches of [
      brandDefault.palette,
      brandDefault.textPalette,
      brandDefault.markers.swatches,
    ]) {
      const ids = swatches.map((swatch) => swatch.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('sets the marker ink at 4.5:1 or more on every marker box', () => {
    for (const swatch of brandDefault.markers.swatches) {
      expect(contrast(brandDefault.markers.ink, swatch.color), swatch.id).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });

  it('names only font families the core may ship', () => {
    expect(OPEN_FAMILIES).toEqual(expect.arrayContaining(Object.values(brandDefault.fonts)));
  });
});
