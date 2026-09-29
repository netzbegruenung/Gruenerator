import { describe, expect, it } from 'vitest';

import { STROKE_ONLY_SHAPES } from './shapes';

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
