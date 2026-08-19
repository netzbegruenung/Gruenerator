import { describe, it, expect } from 'vitest';

import { jaccard } from './setSimilarity.js';

describe('jaccard', () => {
  it('is the overlap over the union', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  // The two MMR call sites folded in here each guarded emptiness differently
  // (`||` vs `&&` on the sizes). Both returned 0 for every empty case; this
  // pins that so a later "simplification" of the guard cannot diverge again.
  it('is 0 whenever either side is empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(jaccard(new Set(['a']), new Set())).toBe(0);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  it('is symmetric', () => {
    const a = new Set(['a', 'b', 'c']);
    const b = new Set(['b', 'c', 'd', 'e']);
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });
});
