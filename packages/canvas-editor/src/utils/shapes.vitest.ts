import { describe, expect, it } from 'vitest';

import { createShape, photoStripBeside, STROKE_ONLY_SHAPES } from './shapes';

describe('STROKE_ONLY_SHAPES', () => {
  it('contains only the line-* ids rendered as Konva Line/Arrow', () => {
    for (const id of STROKE_ONLY_SHAPES) expect(id).toMatch(/^line(-|$)/);
  });

  it('keeps filled arrow paths eligible for gradient fills', () => {
    for (const id of ['arrow', 'double-arrow', 'arrow-curved']) {
      expect(STROKE_ONLY_SHAPES.has(id)).toBe(false);
    }
  });
});

describe('photoStripBeside', () => {
  const page = { width: 1080, height: 1350 };
  /** The composer's panel: a rect stored by its centre. */
  const panel = (y: number, height: number) =>
    Object.assign(createShape('rect', 540, y + height / 2, '#fff', '#fff'), {
      id: 'sc-panel',
      width: 1080,
      height,
    });

  it('finds the strip below a top panel (foto-unten)', () => {
    expect(photoStripBeside([panel(0, 810)], page)).toEqual({
      x: 0,
      y: 810,
      width: 1080,
      height: 540,
    });
  });

  it('finds the strip above a bottom panel (foto-oben)', () => {
    expect(photoStripBeside([panel(540, 810)], page)).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 540,
    });
  });

  it('gives up once the panel no longer sits on an edge across the page', () => {
    expect(photoStripBeside([panel(100, 600)], page)).toBeNull();
    expect(photoStripBeside([{ ...panel(0, 810), rotation: 5 }], page)).toBeNull();
    expect(photoStripBeside([{ ...panel(0, 810), width: 900 }], page)).toBeNull();
    expect(photoStripBeside([], page)).toBeNull();
  });
});
