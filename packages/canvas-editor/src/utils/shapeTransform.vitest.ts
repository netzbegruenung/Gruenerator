import { describe, it, expect } from 'vitest';

import { PATH_VIEWBOX, resizedShapeSize, shapeNodeScale } from './shapeTransform';

describe('resizedShapeSize', () => {
  describe('path shapes (node scale is absolute)', () => {
    // A path shape at width 300 renders with node scale 300 / PATH_VIEWBOX = 3.
    const nodeScaleFor = (width: number) => width / PATH_VIEWBOX;

    it('shrinks when the user drags inward', () => {
      // Default x-mark: 300 wide, dragged to 80%.
      const dragged = nodeScaleFor(300) * 0.8;
      const size = resizedShapeSize(true, { width: 300, height: 300 }, dragged, dragged);

      expect(size.width).toBeCloseTo(240, 6);
      expect(size.height).toBeCloseTo(240, 6);
    });

    it('grows when the user drags outward', () => {
      const dragged = nodeScaleFor(300) * 1.5;
      const size = resizedShapeSize(true, { width: 300, height: 300 }, dragged, dragged);

      expect(size.width).toBe(450);
    });

    it('is stable under a no-op transform', () => {
      const dragged = nodeScaleFor(300);
      const size = resizedShapeSize(true, { width: 300, height: 300 }, dragged, dragged);

      expect(size.width).toBe(300);
      expect(size.height).toBe(300);
    });

    it('does not blow up across repeated shrink drags', () => {
      // The old handler read node.scaleX() as a drag factor, so each 90 % drag
      // multiplied the width by width/PATH_VIEWBOX and the shape exploded.
      let width = 300;
      for (let i = 0; i < 5; i++) {
        width = resizedShapeSize(
          true,
          { width, height: width },
          nodeScaleFor(width) * 0.9,
          1
        ).width;
      }

      expect(width).toBeCloseTo(300 * 0.9 ** 5, 6);
      expect(width).toBeLessThan(300);
    });

    it('resizes each axis independently', () => {
      const size = resizedShapeSize(
        true,
        { width: 300, height: 200 },
        nodeScaleFor(300) * 0.5,
        nodeScaleFor(200) * 2
      );

      expect(size).toEqual({ width: 150, height: 400 });
    });
  });

  describe('non-path shapes (node scale is the drag factor)', () => {
    it('multiplies the stored size by the node scale', () => {
      const size = resizedShapeSize(false, { width: 300, height: 180 }, 0.8, 2);

      expect(size).toEqual({ width: 240, height: 360 });
    });
  });

  it('clamps both families to the minimum size', () => {
    expect(resizedShapeSize(true, { width: 300, height: 300 }, 0.001, 0.001)).toEqual({
      width: 5,
      height: 5,
    });
    expect(resizedShapeSize(false, { width: 300, height: 300 }, 0.001, 0.001)).toEqual({
      width: 5,
      height: 5,
    });
  });
});

describe('shapeNodeScale', () => {
  it('round-trips a path shape through resize', () => {
    const size = resizedShapeSize(true, { width: 300, height: 300 }, 300 / PATH_VIEWBOX / 2, 1.5);
    const scale = shapeNodeScale(true, size);

    expect(resizedShapeSize(true, size, scale.width, scale.height)).toEqual(size);
  });

  it('leaves non-path shapes at scale 1', () => {
    expect(shapeNodeScale(false, { width: 240, height: 120 })).toEqual({ width: 1, height: 1 });
  });
});
