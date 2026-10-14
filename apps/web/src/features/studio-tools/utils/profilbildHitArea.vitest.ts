import { describe, expect, it, vi } from 'vitest';

import { applyPixelHitArea, HIT_ALPHA_THRESHOLD, hitCacheRatios } from './profilbildHitArea';

import type Konva from 'konva';

describe('hitCacheRatios', () => {
  it('keeps small images at full ratio', () => {
    expect(hitCacheRatios(100, 100).pixelRatio).toBe(1);
  });

  it('bounds large images by their longest side', () => {
    const r = hitCacheRatios(1080, 2400);
    expect(r.pixelRatio).toBeCloseTo(0.5);
    expect(r.hitCanvasPixelRatio).toBeCloseTo(0.125);
  });

  it('survives zero sizes', () => {
    expect(hitCacheRatios(0, 0)).toEqual({ pixelRatio: 1, hitCanvasPixelRatio: 1 });
  });
});

describe('applyPixelHitArea', () => {
  const makeNode = (w: number, h: number) =>
    ({
      width: () => w,
      height: () => h,
      cache: vi.fn(),
      drawHitFromCache: vi.fn(),
      clearCache: vi.fn(),
      getLayer: () => ({ batchDraw: vi.fn() }),
    }) as unknown as Konva.Image & { cache: ReturnType<typeof vi.fn> };

  it('caches and draws the hit area from alpha', () => {
    const node = makeNode(500, 500);
    applyPixelHitArea(node);
    expect(node.cache).toHaveBeenCalled();
    expect(node.drawHitFromCache).toHaveBeenCalledWith(HIT_ALPHA_THRESHOLD);
  });

  it('skips empty nodes', () => {
    const node = makeNode(0, 10);
    applyPixelHitArea(node);
    expect(node.cache).not.toHaveBeenCalled();
  });

  it('clears the cache when drawing fails', () => {
    const node = makeNode(10, 10);
    node.cache.mockImplementation(() => {
      throw new Error('tainted');
    });
    applyPixelHitArea(node);
    expect(node.clearCache).toHaveBeenCalled();
  });
});
