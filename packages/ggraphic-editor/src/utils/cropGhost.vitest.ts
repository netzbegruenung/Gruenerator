// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  MAX_OVERLAY_AREA,
  MAX_OVERLAY_SIDE,
  overlayRegion,
} from '@ggraphic/editor/utils/cropGhost';

describe('overlayRegion', () => {
  it('zeichnet nur, was im sichtbaren Ausschnitt liegt', () => {
    const region = overlayRegion(
      { x: -2000, y: -1500, width: 6000, height: 5000 },
      { x: -100, y: -50, width: 800, height: 600 },
      2
    )!;
    expect(region.rect).toEqual({ x: -100, y: -50, width: 800, height: 600 });
    expect(region.ratio).toBe(2);
    expect(region.pixelWidth).toBe(1600);
    expect(region.pixelHeight).toBe(1200);
  });

  it('ohne bekannten Ausschnitt gilt die ganze Box', () => {
    const region = overlayRegion({ x: -10.5, y: 0.2, width: 100, height: 50 }, null, 1)!;
    expect(region.rect).toEqual({ x: -11, y: 0, width: 101, height: 51 });
  });

  it('liefert null, wenn nichts davon sichtbar ist', () => {
    expect(
      overlayRegion(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 0, width: 50, height: 50 },
        1
      )
    ).toBeNull();
  });

  // 350 css px × Zoom 4 × DPR 3 wäre ~17,6 MP, über der iOS-Grenze von 16 777 216 px.
  it('bleibt bei starkem Zoom und hoher Pixeldichte unter der Flächengrenze', () => {
    const region = overlayRegion({ x: 0, y: 0, width: 1400, height: 1400 * 1.25 }, null, 3)!;
    expect(region.pixelWidth * region.pixelHeight).toBeLessThanOrEqual(MAX_OVERLAY_AREA);
    expect(region.ratio).toBeLessThan(3);
    expect(Math.max(region.pixelWidth, region.pixelHeight)).toBeLessThanOrEqual(MAX_OVERLAY_SIDE);
  });

  it('hält die längste Kante unter der Kantengrenze', () => {
    const region = overlayRegion({ x: 0, y: 0, width: 20000, height: 10 }, null, 2)!;
    expect(region.pixelWidth).toBeLessThanOrEqual(MAX_OVERLAY_SIDE);
  });
});
