import { describe, expect, it } from 'vitest';

import {
  alphaBounds,
  defaultPlacement,
  placementRect,
  PROFILBILD_SIZE,
  rescalePlacement,
} from './geometry';

const portrait = { width: 600, height: 800 };

describe('placement', () => {
  it('defaults to centred and bottom-anchored', () => {
    expect(defaultPlacement(portrait)).toEqual({ x: 196, y: 162, scale: 0.85 });
    expect(placementRect(portrait, { x: 10, y: 20, scale: 0.85 })).toEqual({
      x: 10,
      y: 20,
      width: 689,
      height: 918,
    });
  });

  it('rescales around the horizontal centre and the bottom edge', () => {
    const before = placementRect(portrait, { x: 100, y: 50, scale: 0.85 });
    const next = rescalePlacement(portrait, { x: 100, y: 50, scale: 0.85 }, 1);
    const after = placementRect(portrait, next);
    expect(after.height).toBe(1080);
    expect(after.y + after.height).toBe(before.y + before.height);
    expect(Math.abs(after.x + after.width / 2 - (before.x + before.width / 2))).toBeLessThanOrEqual(
      0.5
    );
  });
});

function rgba(w: number, h: number, pixels: [number, number, number][]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, a] of pixels) data[(y * w + x) * 4 + 3] = a;
  return data;
}

describe('alphaBounds', () => {
  it('returns null for a fully transparent image', () => {
    expect(alphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('ignores near-transparent noise below the threshold', () => {
    expect(alphaBounds(rgba(4, 4, [[1, 1, 8]]), 4, 4)).toBeNull();
  });

  it('finds a single pixel', () => {
    expect(alphaBounds(rgba(5, 4, [[3, 2, 255]]), 5, 4)).toEqual({
      x: 3,
      y: 2,
      width: 1,
      height: 1,
    });
  });

  it('finds the box around opaque pixels', () => {
    const px: [number, number, number][] = [
      [2, 1, 255],
      [6, 1, 200],
      [4, 5, 255],
      [0, 0, 3],
    ];
    expect(alphaBounds(rgba(8, 8, px), 8, 8)).toEqual({ x: 2, y: 1, width: 5, height: 5 });
  });
});

describe('defaultPlacement extremes', () => {
  it.each([
    [3000, 1000],
    [1000, 3000],
  ])('keeps a %ix%i cutout fully on canvas and bottom-aligned', (width, height) => {
    const src = { width, height };
    const r = placementRect(src, defaultPlacement(src));
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(PROFILBILD_SIZE);
    expect(r.y + r.height).toBe(PROFILBILD_SIZE);
  });
});
