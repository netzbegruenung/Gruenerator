// SPDX-License-Identifier: MPL-2.0
import type Konva from 'konva';

/** Pixels below this alpha (0-255) count as transparent for pointer hits. */
export const HIT_ALPHA_THRESHOLD = 20;
const MAX_CACHE_SIDE = 1200;
const MAX_HIT_SIDE = 300;

/**
 * Cache canvases large enough to stay sharp but bounded in memory; the hit canvas can be coarse.
 * `sharpness`: cache pixels per node pixel, for a small node that is drawn scaled up.
 */
export function hitCacheRatios(width: number, height: number, sharpness = 1) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { pixelRatio: 1, hitCanvasPixelRatio: 1 };
  return {
    pixelRatio: Math.min(sharpness, MAX_CACHE_SIDE / longest),
    hitCanvasPixelRatio: Math.min(1, MAX_HIT_SIDE / longest),
  };
}

/** Restricts a Konva image to its visible pixels for hit testing. Re-run after image or size changes. */
export function applyPixelHitArea(node: Konva.Image, sharpness = 1) {
  const width = node.width();
  const height = node.height();
  if (!(width > 0) || !(height > 0)) return;
  try {
    node.cache(hitCacheRatios(width, height, sharpness));
    node.drawHitFromCache(HIT_ALPHA_THRESHOLD);
    node.getLayer()?.batchDraw();
  } catch {
    // tainted or empty canvas: fall back to the bounding-box hit area
    node.clearCache();
  }
}
