import {
  fitScaleForRatio,
  PRESENTATION_MIN_SCALE,
  PRESENTATION_SCALE_LADDER,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { pickScale } from './useAutoFitScale.js';

/**
 * A monotonic `fits` probe: the content needs `needed` px at scale 1 and the
 * surface holds `capacity`, so a step fits when `needed * scale <= capacity`.
 * Mirrors how text actually behaves — smaller type is never taller.
 */
function probe(needed: number, capacity = 540) {
  const seen: number[] = [];
  const fits = (scale: number): boolean => {
    seen.push(scale);
    return needed * scale <= capacity;
  };
  return { fits, seen };
}

/** Reference implementation: the naive full top-down scan. */
function scanFromTop(fits: (scale: number) => boolean): number {
  for (const s of PRESENTATION_SCALE_LADDER) {
    if (fits(s)) return s;
  }
  return PRESENTATION_MIN_SCALE;
}

describe('pickScale', () => {
  it('keeps full size when the content already fits', () => {
    const { fits } = probe(400);
    expect(pickScale(fits, 1)).toBe(1);
  });

  it('shrinks to the largest step that fits', () => {
    // 700px of content in a 540px box needs <= 0.771 → 0.7 is the first fit.
    const { fits } = probe(700);
    expect(pickScale(fits, 1)).toBe(0.7);
  });

  it('bottoms out at the smallest step when nothing fits', () => {
    const { fits } = probe(5000);
    expect(pickScale(fits, 1)).toBe(PRESENTATION_MIN_SCALE);
  });

  it('grows back when the content shrinks again', () => {
    const { fits } = probe(400);
    expect(pickScale(fits, 0.5)).toBe(1);
  });

  it('converges on the same step no matter where the search starts', () => {
    for (const needed of [300, 560, 620, 700, 900, 1400]) {
      const expected = scanFromTop(probe(needed).fits);
      for (const from of PRESENTATION_SCALE_LADDER) {
        expect(pickScale(probe(needed).fits, from)).toBe(expected);
      }
    }
  });

  it('costs at most two probes when the previous step still fits', () => {
    // The common keystroke path: content changed slightly, same step wins.
    const { fits, seen } = probe(700);
    expect(pickScale(fits, 0.7)).toBe(0.7);
    expect(seen.length).toBeLessThanOrEqual(2);
  });

  it('falls back to a full scan when the starting step is not on the ladder', () => {
    const { fits } = probe(700);
    expect(pickScale(fits, 0.42)).toBe(0.7);
  });
});

describe('fitScaleForRatio', () => {
  it('agrees with the measured ladder walk for the same content', () => {
    // The mobile (compute-from-ratio) and web (probe-the-ladder) renderers must
    // land on the same step, otherwise the same deck looks different per client.
    for (const needed of [300, 540, 560, 620, 700, 900, 1400]) {
      expect(fitScaleForRatio(540 / needed)).toBe(pickScale(probe(needed).fits, 1));
    }
  });

  it('keeps full size when the content fits', () => {
    expect(fitScaleForRatio(1)).toBe(1);
    expect(fitScaleForRatio(3)).toBe(1);
  });

  it('bottoms out at the smallest step', () => {
    expect(fitScaleForRatio(0.1)).toBe(PRESENTATION_MIN_SCALE);
  });

  it('degrades to full size on an unusable measurement', () => {
    // A 0 / NaN ratio means the measurement failed — render as before rather
    // than shrinking a slide for no reason.
    expect(fitScaleForRatio(0)).toBe(1);
    expect(fitScaleForRatio(Number.NaN)).toBe(1);
    expect(fitScaleForRatio(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
