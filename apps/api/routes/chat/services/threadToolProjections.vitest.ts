import { describe, expect, it } from 'vitest';

import { toRecipesUsed } from './threadToolProjections.js';

describe('toRecipesUsed', () => {
  it('reads mention and row id of each loaded recipe', () => {
    expect(
      toRecipesUsed({
        recipesUsed: [
          { mention: 'presse', title: 'PM', source: 'system' },
          { mention: 'antwortbrief', title: 'Brief', source: 'user', id: 'r-1' },
        ],
      })
    ).toEqual([
      { mention: 'presse', id: null },
      { mention: 'antwortbrief', id: 'r-1' },
    ]);
  });

  it('skips malformed entries and rows without the field', () => {
    expect(toRecipesUsed({ recipesUsed: [null, 7, { title: 'ohne Mention' }] })).toEqual([]);
    expect(toRecipesUsed({ recipesUsed: 'presse' })).toEqual([]);
    expect(toRecipesUsed({})).toEqual([]);
    expect(toRecipesUsed(undefined)).toEqual([]);
  });
});
