import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  defaultPlacement,
  PRIDE_STRIPES,
  PROFILBILD_STICKERS,
} from '@gruenerator/shared/profilbild';
import { describe, expect, it } from 'vitest';

import { initialModel, newSticker, sceneScale, stripeRects, swatchGradient } from './sceneModel';

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

describe('initialModel', () => {
  it('starts on the first colour swatch with the person placed and no stickers', () => {
    const de = initialModel({ width: 400, height: 800 }, false);
    expect(de.background).toEqual(COLOR_SWATCHES_DE[0].background);
    expect(de.person).toEqual(defaultPlacement({ width: 400, height: 800 }));
    expect(de.stickers).toEqual([]);
    expect(initialModel({ width: 400, height: 800 }, true).background).toEqual(
      COLOR_SWATCHES_AT[0].background
    );
  });
});

describe('newSticker', () => {
  it('centres the sticker at its default width and keeps the aspect ratio', () => {
    const teamgruen = PROFILBILD_STICKERS.find((s) => s.id === 'teamgruen')!;
    const s = newSticker(teamgruen, { width: 200, height: 100 }, 'u1');
    expect(s).toEqual({
      uid: 'u1',
      src: teamgruen.src,
      x: 540,
      y: 540,
      width: 0.25 * 1080 * 1.6,
      height: (0.25 * 1080 * 1.6) / 2,
      rotation: 0,
    });
  });
});

describe('swatchGradient', () => {
  it('maps a 180deg gradient to top → bottom', () => {
    const g = swatchGradient({ kind: 'gradient', stops: ['#000', '#fff'], angle: 180 });
    expect(g.colors).toEqual(['#000', '#fff']);
    expect(g.locations).toBeNull();
    expect(g.start.x).toBeCloseTo(0.5);
    expect(g.start.y).toBeCloseTo(0);
    expect(g.end.x).toBeCloseTo(0.5);
    expect(g.end.y).toBeCloseTo(1);
  });

  it('draws stripes as hard stops', () => {
    const g = swatchGradient({ kind: 'stripes', colors: ['#a', '#b'] });
    expect(g.colors).toEqual(['#a', '#a', '#b', '#b']);
    expect(g.locations).toEqual([0, 0.5, 0.5, 1]);
  });
});
