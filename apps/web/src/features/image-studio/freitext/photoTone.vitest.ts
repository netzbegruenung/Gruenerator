import { describe, expect, it } from 'vitest';

import { classifyTone, sideLuminance } from './photoTone';

const W = 10;
const H = 10;
const fill = (pixel: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = pixel(x, y);
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  return data;
};

describe('photo tone', () => {
  it('classifies bright, dark and busy photos', () => {
    expect(classifyTone(0.7, 0.05)).toBe('hell');
    expect(classifyTone(0.45, 0.25)).toBe('hell');
    expect(classifyTone(0.45, 0.1)).toBe('mittel');
    expect(classifyTone(0.1, 0.05)).toBe('dunkel');
    expect(classifyTone(0.1, 0.3)).toBe('mittel');
    expect(classifyTone(0.35, 0.1)).toBe('mittel');
  });

  it('measures only the text side', () => {
    // Left half white, right half black.
    const img = fill((x) => (x < 5 ? 255 : 0));
    expect(sideLuminance(img, W, H, 'links').mean).toBeGreaterThan(0.5);
    expect(sideLuminance(img, W, H, 'rechts').mean).toBeLessThan(0.5);
    expect(
      sideLuminance(
        fill(() => 255),
        W,
        H,
        'unten'
      )
    ).toEqual({ mean: 1, stdev: 0 });
    expect(
      sideLuminance(
        fill((_, y) => (y < 4 ? 255 : 0)),
        W,
        H,
        'unten'
      ).mean
    ).toBeLessThan(0.2);
    expect(
      sideLuminance(
        fill((_, y) => (y < 4 ? 255 : 0)),
        W,
        H,
        'oben'
      ).mean
    ).toBeGreaterThan(0.5);
  });

  it('reports a busy photo with a high spread', () => {
    const { stdev } = sideLuminance(
      fill((x, y) => ((x + y) % 2 ? 255 : 0)),
      W,
      H,
      'links'
    );
    expect(stdev).toBeGreaterThan(0.4);
  });
});
