import { describe, expect, it } from 'vitest';

import { showsSystemRecipes } from './agenturaFilter.js';

describe('showsSystemRecipes', () => {
  it('hides system recipes in the unfiltered shop', () => {
    expect(showsSystemRecipes('all', false)).toBe(false);
    expect(showsSystemRecipes('agent', false)).toBe(false);
  });

  it('shows them when filtering for recipes or searching', () => {
    expect(showsSystemRecipes('recipe', false)).toBe(true);
    expect(showsSystemRecipes('all', true)).toBe(true);
  });
});
