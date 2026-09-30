import { describe, expect, it } from 'vitest';

import { tabNeighbours, type TabRoute } from './tabOrder';

const WORKPLACE: readonly TabRoute[] = ['/start', '/(tabs)/(arbeiten)'];

describe('tabNeighbours', () => {
  it('walks the row in both directions', () => {
    expect(tabNeighbours(WORKPLACE, '/start')).toEqual({
      inRow: true,
      next: '/(tabs)/(arbeiten)',
      previous: undefined,
    });
    expect(tabNeighbours(WORKPLACE, '/(tabs)/(arbeiten)')).toEqual({
      inRow: true,
      next: undefined,
      previous: '/start',
    });
  });

  // Studio and Wissen are still routes in the workplace shell, just not tabs.
  // Without the guard `indexOf` returns -1 and `index + 1` lands on Chat.
  it('gives a screen outside the row no neighbours', () => {
    expect(tabNeighbours(WORKPLACE, '/(tabs)/(recherche)')).toEqual({
      inRow: false,
      next: undefined,
      previous: undefined,
    });
  });
});
