import { describe, expect, it } from 'vitest';

import { knownSelectionIds } from './knownSelectionIds';

const snapshot = {
  elementsSummary: [{ id: 'balken' }, { id: 'sunflower' }],
  textFields: [{ field: 'headline' }],
} as unknown as Parameters<typeof knownSelectionIds>[1];

describe('knownSelectionIds', () => {
  it('drops ids the snapshot does not list', () => {
    expect(knownSelectionIds(['balken', 'ghost', 'headline'], snapshot)).toEqual([
      'balken',
      'headline',
    ]);
  });
  it('returns an empty list when nothing is known', () => {
    expect(knownSelectionIds(['ghost'], snapshot)).toEqual([]);
  });
});
