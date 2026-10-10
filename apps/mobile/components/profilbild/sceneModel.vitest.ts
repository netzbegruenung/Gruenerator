import { PRIDE_STRIPES } from '@gruenerator/shared/profilbild';
import { describe, expect, it } from 'vitest';

import { sceneScale, stripeRects } from './sceneModel';

describe('stripeRects', () => {
  it('covers the canvas with gapless bands, remainder in the last one', () => {
    const rects = stripeRects(PRIDE_STRIPES);
    expect(rects).toHaveLength(6);
    expect(rects.reduce((sum, r) => sum + r.height, 0)).toBe(1080);
    rects.forEach((r, i) => {
      expect(r.y).toBe(i === 0 ? 0 : rects[i - 1].y + rects[i - 1].height);
      expect(r.color).toBe(PRIDE_STRIPES[i]);
    });
    expect(rects[5].height).toBeGreaterThanOrEqual(rects[0].height);
  });

  it('puts the rounding remainder into the last band', () => {
    const rects = stripeRects(['#000', '#111', '#222'], 100);
    expect(rects.map((r) => r.height)).toEqual([33, 33, 34]);
  });
});

describe('sceneScale', () => {
  it('maps view size to scene scale', () => {
    expect(sceneScale(270)).toBe(0.25);
  });
});
