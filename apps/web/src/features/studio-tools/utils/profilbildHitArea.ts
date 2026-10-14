import type Konva from 'konva';

/** Pixels below this alpha (0-255) count as transparent for pointer hits. */
export const HIT_ALPHA_THRESHOLD = 20;
const MAX_CACHE_SIDE = 1200;
const MAX_HIT_SIDE = 300;

/** Cache canvases large enough to stay sharp but bounded in memory; the hit canvas can be coarse. */
export function hitCacheRatios(width: number, height: number) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { pixelRatio: 1, hitCanvasPixelRatio: 1 };
  return {
    pixelRatio: Math.min(1, MAX_CACHE_SIDE / longest),
    hitCanvasPixelRatio: Math.min(1, MAX_HIT_SIDE / longest),
  };
}

/** Restricts a Konva image to its visible pixels for hit testing. Re-run after image or size changes. */
export function applyPixelHitArea(node: Konva.Image) {
  const width = node.width();
  const height = node.height();
  if (!(width > 0) || !(height > 0)) return;
  try {
    node.cache(hitCacheRatios(width, height));
    node.drawHitFromCache(HIT_ALPHA_THRESHOLD);
    node.getLayer()?.batchDraw();
  } catch {
    // tainted or empty canvas: fall back to the bounding-box hit area
    node.clearCache();
  }
}
