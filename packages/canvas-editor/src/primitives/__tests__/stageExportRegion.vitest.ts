import { describe, expect, it } from 'vitest';

import { stageExportRegion } from '../CanvasStage';

/** Konva's bitmap size: `Canvas._bitmapSize` floors region × pixelRatio. */
const bitmap = (size: number, ratio: number) => Math.floor(size * ratio);

describe('stageExportRegion (#4091)', () => {
  const FORMATS = [
    [1080, 1350],
    [1080, 1440],
    [1080, 1080],
  ] as const;

  it.each(FORMATS)('exports %i×%i exactly at every container width', (w, h) => {
    for (let containerW = 200; containerW <= 600; containerW++) {
      // Mirrors CanvasStage.updateSize: width rounded, scale derived from it.
      const displayScale = Math.round(containerW) / w;
      for (const pixelRatio of [1, 2, 0.5]) {
        const r = stageExportRegion(w, h, displayScale, pixelRatio);
        expect(bitmap(r.width, r.pixelRatio)).toBe(Math.round(w * pixelRatio));
        expect(bitmap(r.height, r.pixelRatio)).toBe(Math.round(h * pixelRatio));
      }
    }
  });
});
