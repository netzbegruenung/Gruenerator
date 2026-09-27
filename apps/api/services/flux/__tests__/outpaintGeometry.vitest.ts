import { IMAGE_FORMAT_IDS } from '@gruenerator/shared/image-studio';
import { describe, expect, it } from 'vitest';

import {
  computeOutpaintGeometry,
  OutpaintGeometryError,
  OUTPAINT_MAX_AREA,
  OUTPAINT_MAX_SIDE,
  OUTPAINT_MIN_SIDE,
} from '../outpaintGeometry.js';

const RATIO: Record<string, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};

// The dimensions every pure-create variant produces (FluxPromptBuilder's
// `instagram` preset) — the source that made 16:9 unreachable in #3388.
const GENERATED = { width: 1088, height: 1360 };

describe('computeOutpaintGeometry', () => {
  it('reaches 16:9 from a freshly generated 1088x1360 image', () => {
    const geo = computeOutpaintGeometry(GENERATED.width, GENERATED.height, '16:9');

    expect(Math.max(geo.width, geo.height)).toBeLessThanOrEqual(OUTPAINT_MAX_SIDE);
    expect(geo.width * geo.height).toBeLessThanOrEqual(OUTPAINT_MAX_AREA);
    expect(geo.width / geo.height).toBeCloseTo(16 / 9, 2);
    // Budget is exceeded, so the source comes along scaled down.
    expect(geo.needsResize).toBe(true);
    expect(geo.sourceWidth).toBeLessThanOrEqual(geo.width);
    expect(geo.sourceHeight).toBeLessThanOrEqual(geo.height);
  });

  it.each(IMAGE_FORMAT_IDS)('keeps a generated image inside the budget for %s', (aspect) => {
    const geo = computeOutpaintGeometry(GENERATED.width, GENERATED.height, aspect);

    expect(Math.max(geo.width, geo.height)).toBeLessThanOrEqual(OUTPAINT_MAX_SIDE);
    expect(Math.min(geo.width, geo.height)).toBeGreaterThanOrEqual(OUTPAINT_MIN_SIDE);
    expect(geo.width * geo.height).toBeLessThanOrEqual(OUTPAINT_MAX_AREA);
    expect(geo.width / geo.height).toBeCloseTo(RATIO[aspect], 2);
    expect(geo.sourceWidth).toBeLessThanOrEqual(geo.width);
    expect(geo.sourceHeight).toBeLessThanOrEqual(geo.height);
  });

  it('leaves the source untouched when the canvas already fits', () => {
    const geo = computeOutpaintGeometry(GENERATED.width, GENERATED.height, '1:1');

    expect(geo.needsResize).toBe(false);
    expect(geo.sourceWidth).toBe(GENERATED.width);
    expect(geo.sourceHeight).toBe(GENERATED.height);
  });

  it('expands evenly when the source already has the target ratio', () => {
    const geo = computeOutpaintGeometry(1000, 1000, '1:1');

    expect(geo.width).toBeGreaterThan(1000);
    expect(geo.width).toBe(geo.height);
    expect(geo.needsResize).toBe(false);
  });

  it('rejects a source too small to reach the format', () => {
    expect(() => computeOutpaintGeometry(120, 120, '16:9')).toThrow(OutpaintGeometryError);
  });

  it('rejects a source without usable dimensions', () => {
    expect(() => computeOutpaintGeometry(0, 800, '1:1')).toThrow(OutpaintGeometryError);
  });
});
