import { describe, expect, it } from 'vitest';

import { recallAtK } from './recallAtK.js';

describe('recallAtK', () => {
  it('counts full overlap as total recall', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ overlap: 3, total: 3 });
  });

  it('counts partial overlap against the exact set size', () => {
    expect(recallAtK(['a', 'x', 'c'], ['a', 'b', 'c'])).toEqual({ overlap: 2, total: 3 });
  });

  it('counts zero overlap when nothing matches', () => {
    expect(recallAtK(['x', 'y'], ['a', 'b', 'c'])).toEqual({ overlap: 0, total: 3 });
  });

  it('dedupes the exact set before sizing it', () => {
    expect(recallAtK(['a'], ['a', 'a', 'b'])).toEqual({ overlap: 1, total: 2 });
  });

  it('handles an empty exact set', () => {
    expect(recallAtK(['a', 'b'], [])).toEqual({ overlap: 0, total: 0 });
  });

  it('handles an empty approx set', () => {
    expect(recallAtK([], ['a', 'b'])).toEqual({ overlap: 0, total: 2 });
  });
});
