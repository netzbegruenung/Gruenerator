import {
  CROP_ASPECT_PRESETS,
  cropAspectRatio,
  frameForAspect,
} from '@ggraphic/editor/utils/cropAspect';
import { describe, expect, it } from 'vitest';

const photo = { x: -100, y: -50, width: 1200, height: 800 };

describe('crop aspect presets', () => {
  it('lists the presets in the toolbar order', () => {
    expect(CROP_ASPECT_PRESETS.map((p) => p.label)).toEqual([
      'Freiform',
      'Original',
      '1:1',
      '4:5',
      '9:16',
      '16:9',
      '4:3',
      '3:4',
    ]);
  });

  it('has no ratio for Freiform and the photo ratio for Original', () => {
    expect(cropAspectRatio('free', { width: 1200, height: 800 })).toBeNull();
    expect(cropAspectRatio('original', { width: 1200, height: 800 })).toBe(1.5);
    expect(cropAspectRatio('9:16', { width: 1200, height: 800 })).toBe(9 / 16);
  });
});

describe('frameForAspect', () => {
  it('centres the largest box of the ratio on the current frame', () => {
    const frame = { x: 400, y: 250, width: 200, height: 200 };
    expect(frameForAspect(frame, photo, 3 / 4)).toEqual({
      x: 200,
      y: -50,
      width: 600,
      height: 800,
    });
  });

  it('is limited by the photo width for wide ratios', () => {
    const frame = { x: -100, y: -50, width: 1200, height: 800 };
    const next = frameForAspect(frame, photo, 16 / 9);
    expect(next.width).toBe(1200);
    expect(next.height).toBeCloseTo(675);
    expect(next.x).toBe(-100);
    expect(next.y).toBeCloseTo(-50 + (800 - 675) / 2);
  });

  it('shifts the box back onto the photo when the frame sits at an edge', () => {
    const frame = { x: -100, y: -50, width: 100, height: 100 };
    expect(frameForAspect(frame, photo, 1)).toEqual({ x: -100, y: -50, width: 800, height: 800 });
    const corner = { x: 1000, y: 650, width: 100, height: 100 };
    expect(frameForAspect(corner, photo, 1)).toEqual({ x: 300, y: -50, width: 800, height: 800 });
  });

  it('gives the whole photo for its own ratio', () => {
    const frame = { x: 0, y: 0, width: 300, height: 300 };
    expect(frameForAspect(frame, photo, 1.5)).toEqual(photo);
  });

  it('is stable: applying it again changes nothing', () => {
    const frame = { x: 50, y: 20, width: 300, height: 500 };
    for (const ratio of [1, 4 / 5, 9 / 16, 16 / 9, 4 / 3, 3 / 4]) {
      const once = frameForAspect(frame, photo, ratio);
      expect(frameForAspect(once, photo, ratio)).toEqual(once);
      expect(once.width / once.height).toBeCloseTo(ratio);
    }
  });

  it('does not shrink step by step when switching presets', () => {
    let frame = { x: 0, y: 0, width: 600, height: 400 };
    for (const ratio of [1, 16 / 9, 9 / 16, 1]) frame = frameForAspect(frame, photo, ratio);
    expect(frame.height).toBe(800);
  });
});
