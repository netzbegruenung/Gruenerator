import { describe, expect, it } from 'vitest';

import { fitInTarget, matchesRatio } from './outpaintPreview';

describe('fitInTarget', () => {
  it('pads top and bottom for a wide source in a square frame', () => {
    expect(fitInTarget(2000, 1000, '1:1')).toEqual({ left: 0, top: 25, width: 100, height: 50 });
  });

  it('pads left and right for a tall source in a wide frame', () => {
    const r = fitInTarget(900, 1600, '16:9');
    expect(r.top).toBe(0);
    expect(r.height).toBe(100);
    expect(r.width).toBeCloseTo(31.64, 1);
    expect(r.left).toBeCloseTo((100 - r.width) / 2, 5);
  });

  it('fills the frame when ratios are equal', () => {
    const r = fitInTarget(800, 600, '4:3');
    expect(r.left).toBeCloseTo(0, 5);
    expect(r.top).toBeCloseTo(0, 5);
    expect(r.width).toBeCloseTo(100, 5);
    expect(r.height).toBeCloseTo(100, 5);
  });
});

describe('matchesRatio', () => {
  it('accepts near-equal ratios and rejects others', () => {
    expect(matchesRatio(1000, 1001, '1:1')).toBe(true);
    expect(matchesRatio(1000, 800, '1:1')).toBe(false);
  });
});
