// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { type GradientFill } from '@ggraphic/editor/utils/gradientFill';
import {
  alphaBands,
  alphaIntervals,
  translucentHitFunc,
} from '@ggraphic/editor/utils/gradientHitArea';

const linear = (angle: number, ...colors: [number, string][]): GradientFill => ({
  type: 'linear',
  angle,
  stops: colors.map(([offset, color]) => ({ offset, color })),
});

/** A scrim as the composer writes it: clear at the start, dense at the end. */
const scrim = (angle: number) =>
  linear(angle, [0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0.5)']);

const box = { x: 0, y: 0, width: 100, height: 200 };
const yRange = (band: { x: number; y: number }[]) => {
  const ys = band.map((p) => p.y);
  return [Math.min(...ys), Math.max(...ys)];
};
const xRange = (band: { x: number; y: number }[]) => {
  const xs = band.map((p) => p.x);
  return [Math.min(...xs), Math.max(...xs)];
};

describe('alphaIntervals', () => {
  it('finds where a fade crosses the threshold and runs on past the dense end', () => {
    const [interval, ...rest] = alphaIntervals(scrim(90).stops, 0.1);
    expect(rest).toEqual([]);
    expect(interval![0]).toBeCloseTo(0.25);
    expect(interval![1]).toBeGreaterThan(1);
  });

  it('splits an opaque–clear–opaque fill into two stretches', () => {
    const g = linear(0, [0, '#000'], [0.5, 'transparent'], [1, '#000']);
    const intervals = alphaIntervals(g.stops, 0.5);
    expect(intervals).toHaveLength(2);
    expect(intervals[0]![1]).toBeCloseTo(0.25);
    expect(intervals[1]![0]).toBeCloseTo(0.75);
  });

  it('reads named, short-hex and unparseable colours', () => {
    expect(alphaIntervals(linear(0, [0, 'transparent'], [1, '#0000']).stops, 0.1)).toEqual([]);
    // An unparseable colour counts as opaque: a hit too many beats a lost element.
    expect(alphaIntervals(linear(0, [0, 'nonsense'], [1, 'nonsense']).stops, 0.1)).toHaveLength(1);
  });
});

describe('alphaBands', () => {
  it.each([
    // angle, dense side, the band's extent along the axis on that side
    [90, 'bottom'],
    [270, 'top'],
    [0, 'right'],
    [180, 'left'],
  ] as const)('%i° puts the band on the %s', (angle, side) => {
    const [band, ...rest] = alphaBands(scrim(angle), box, 0.1);
    expect(rest).toEqual([]);
    const vertical = side === 'top' || side === 'bottom';
    const [lo, hi] = vertical ? yRange(band!) : xRange(band!);
    const full = vertical ? box.height : box.width;
    if (side === 'bottom' || side === 'right') {
      expect(lo).toBeCloseTo(full * 0.25);
      expect(hi).toBeGreaterThan(full);
    } else {
      expect(hi).toBeCloseTo(full * 0.75);
      expect(lo).toBeLessThan(0);
    }
  });
});

describe('translucentHitFunc', () => {
  it('only takes over for a linear fill that is partly clear', () => {
    expect(translucentHitFunc(null)).toBeUndefined();
    expect(translucentHitFunc(linear(90, [0, '#1D3557'], [1, '#002216']))).toBeUndefined();
    // Wholly clear: keep the box, or nothing could ever select it.
    expect(translucentHitFunc(linear(90, [0, 'transparent'], [1, 'transparent']))).toBeUndefined();
    expect(
      translucentHitFunc({ ...scrim(90), type: 'radial' } satisfies GradientFill)
    ).toBeUndefined();
    expect(translucentHitFunc(scrim(90))).toBeTypeOf('function');
  });
});
