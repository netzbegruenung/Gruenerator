import { describe, it, expect } from 'vitest';

import { pairOutcomes } from './compareOutcomes.js';

describe('pairOutcomes', () => {
  it('pairs a matched id set with no missing entries either way', () => {
    const off = [
      { id: 'a', rank: 1 },
      { id: 'b', rank: 3 },
    ];
    const on = [
      { id: 'a', rank: 2 },
      { id: 'b', rank: 3 },
    ];

    const result = pairOutcomes(off, on);

    expect(result.missingFromOff).toEqual([]);
    expect(result.missingFromOn).toEqual([]);
    expect(result.paired).toEqual([
      { id: 'a', offRank: 1, onRank: 2 },
      { id: 'b', offRank: 3, onRank: 3 },
    ]);
  });

  it('reports a mismatched id set in both directions', () => {
    const off = [
      { id: 'a', rank: 1 },
      { id: 'only-off', rank: 5 },
    ];
    const on = [
      { id: 'a', rank: 2 },
      { id: 'only-on', rank: 1 },
    ];

    const result = pairOutcomes(off, on);

    expect(result.missingFromOn).toEqual(['only-off']);
    expect(result.missingFromOff).toEqual(['only-on']);
    expect(result.paired).toEqual([{ id: 'a', offRank: 1, onRank: 2 }]);
  });
});
