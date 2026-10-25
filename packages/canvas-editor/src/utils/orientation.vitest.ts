import { describe, expect, it } from 'vitest';

import {
  axisAlignedBounds,
  centreOf,
  normalizeRotation,
  placeKeepingCentre,
  signedScale,
  type NodeFrame,
} from './orientation';

const topLeft = (rotation: number): NodeFrame => ({
  x: 10,
  y: 20,
  rotation,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  local: { x: 0, y: 0, width: 100, height: 50 },
});
const centred: NodeFrame = {
  x: 60,
  y: 45,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  offsetX: 50,
  offsetY: 25,
  local: { x: 0, y: 0, width: 100, height: 50 },
};

describe('orientation', () => {
  it('normalizes into (-180, 180]', () => {
    expect([270, -180, 360, 540, -190].map(normalizeRotation)).toEqual([-90, 180, 0, 180, 170]);
  });
  it('keeps the centre of a top-left node when turning 90°', () => {
    expect(placeKeepingCentre(topLeft(0), { rotation: 90 })).toEqual({ x: 85, y: -5 });
    expect(centreOf({ ...topLeft(90), x: 85, y: -5 })).toEqual({ x: 60, y: 45 });
  });
  it('leaves a centre-pivot node where it is', () => {
    expect(placeKeepingCentre(centred, { rotation: 135 })).toEqual({ x: 60, y: 45 });
  });
  it('keeps the centre when the scale sign flips', () => {
    expect(placeKeepingCentre(centred, { rotation: 0, scaleX: -1 })).toEqual({ x: 60, y: 45 });
  });
  it('bounds a rotated box axis-aligned around the same centre', () => {
    expect(axisAlignedBounds({ ...centred, rotation: 90 })).toEqual({
      x: 35,
      y: -5,
      width: 50,
      height: 100,
    });
    const b = axisAlignedBounds({ ...centred, rotation: 45 });
    expect(b.width).toBeCloseTo(150 / Math.SQRT2);
    expect(b.height).toBeCloseTo(150 / Math.SQRT2);
  });
  it('signs the scale', () => {
    expect(signedScale(2, true)).toBe(-2);
    expect(signedScale(-2, false)).toBe(2);
  });
});
