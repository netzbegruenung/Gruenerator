import { describe, expect, it } from 'vitest';

import {
  alphaBounds,
  effectPadding,
  hasTransparency,
  outlineOffsets,
  stickerLayout,
  STICKER_MAX_SIDE,
  STICKER_MIN_SIDE,
} from './stickerEffects';

/** RGBA buffer with the given pixels set to the given alpha. */
function pixels(width: number, height: number, set: [number, number, number][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, a] of set) data[(y * width + x) * 4 + 3] = a;
  return data;
}

describe('alphaBounds', () => {
  it('boxes every pixel above the threshold', () => {
    const data = pixels(10, 8, [
      [2, 3, 255],
      [7, 1, 100],
      [4, 6, 9],
    ]);
    expect(alphaBounds(data, 10, 8)).toEqual({ x: 2, y: 1, width: 6, height: 6 });
  });

  it('ignores near-transparent haze at the threshold', () => {
    const data = pixels(10, 10, [
      [5, 5, 255],
      [0, 0, 8],
      [9, 9, 3],
    ]);
    expect(alphaBounds(data, 10, 10)).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it('is null for a fully transparent image', () => {
    expect(alphaBounds(pixels(4, 4, []), 4, 4)).toBeNull();
  });
});

describe('hasTransparency', () => {
  it('tells a sticker PNG from a flat photo', () => {
    const opaque = new Uint8ClampedArray(16).fill(255);
    expect(hasTransparency(opaque)).toBe(false);
    opaque[7] = 0;
    expect(hasTransparency(opaque)).toBe(true);
  });
});

describe('effectPadding', () => {
  it('adds outline and shadow reach to a small safety margin', () => {
    expect(effectPadding({ outline: null, shadow: null })).toBe(4);
    expect(
      effectPadding({
        outline: { width: 24, color: '#fff' },
        shadow: { blur: 20, offsetY: 10, opacity: 0.3 },
      })
    ).toBe(58);
  });
});

describe('stickerLayout', () => {
  it('fits a large motif so outline and shadow stay inside 1024', () => {
    const layout = stickerLayout({ width: 3000, height: 2000 }, 30);
    expect(layout.width).toBe(STICKER_MAX_SIDE);
    expect(layout.effectScale).toBe(1);
    expect(layout.scale).toBeCloseTo((1024 - 60) / 3000);
    expect(layout.x).toBe(30);
    expect(layout.height).toBe(Math.round(2000 * layout.scale) + 60);
    expect(layout.y).toBe(30);
  });

  it('keeps a small motif at its size and shrinks the effects with it', () => {
    const layout = stickerLayout({ width: 241, height: 120 }, 30);
    expect(layout.scale).toBe(1);
    expect(layout.effectScale).toBeCloseTo(241 / 964);
    const pad = Math.round(30 * layout.effectScale);
    expect(layout.width).toBe(241 + 2 * pad);
    expect(layout.height).toBe(120 + 2 * pad);
  });

  it('pads a tiny short side up to the minimum, centred', () => {
    const layout = stickerLayout({ width: 400, height: 20 }, 4);
    expect(layout.height).toBe(STICKER_MIN_SIDE);
    expect(layout.y).toBe(Math.round((STICKER_MIN_SIDE - 20) / 2));
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(STICKER_MAX_SIDE);
  });
});

describe('outlineOffsets', () => {
  it('stamps three rings at the full, two-thirds and one-third radius', () => {
    const offsets = outlineOffsets(24);
    const radii = [...new Set(offsets.map(({ dx, dy }) => Math.round(Math.hypot(dx, dy))))];
    expect(radii.sort((a, b) => a - b)).toEqual([8, 16, 24]);
  });

  it.each([8, 24, 48])('keeps the scallops on a %ipx contour below a quarter pixel', (r) => {
    const ring = outlineOffsets(r).filter(({ dx, dy }) => Math.round(Math.hypot(dx, dy)) === r);
    const [a, b] = ring;
    const chord = Math.hypot(a!.dx - b!.dx, a!.dy - b!.dy);
    expect(chord ** 2 / (8 * r)).toBeLessThan(0.25);
  });

  it('has nothing to stamp without a width', () => {
    expect(outlineOffsets(0)).toEqual([]);
  });
});
