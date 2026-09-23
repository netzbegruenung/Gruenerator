import { describe, it, expect } from 'vitest';

import { rerankDelta } from './rerankDelta.js';

describe('rerankDelta', () => {
  it('buckets improved, worsened, and unchanged cases', () => {
    const result = rerankDelta([
      { id: 'better', rank: 5, rerankRank: 1 },
      { id: 'worse', rank: 1, rerankRank: 5 },
      { id: 'same', rank: 2, rerankRank: 2 },
    ]);
    expect(result).toEqual({ improved: ['better'], worsened: ['worse'], unchanged: ['same'] });
  });

  it('treats a miss becoming a hit as improved and a hit becoming a miss as worsened', () => {
    const result = rerankDelta([
      { id: 'found', rank: null, rerankRank: 3 },
      { id: 'lost', rank: 3, rerankRank: null },
      { id: 'still-miss', rank: null, rerankRank: null },
    ]);
    expect(result.improved).toEqual(['found']);
    expect(result.worsened).toEqual(['lost']);
    expect(result.unchanged).toEqual(['still-miss']);
  });

  it('excludes cases the rerank step never scored', () => {
    const result = rerankDelta([{ id: 'skipped', rank: 1 }]);
    expect(result).toEqual({ improved: [], worsened: [], unchanged: [] });
  });
});
