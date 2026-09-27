import { matchesAgenturaType } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { pinnedFirst } from './marketFilter';

describe('matchesAgenturaType', () => {
  const agent = { kind: 'agent' as const, isFavorite: false };
  const recipe = { kind: 'recipe' as const, isFavorite: false };
  const task = { kind: 'task' as const, isFavorite: false };
  const favRecipe = { kind: 'recipe' as const, isFavorite: true };

  it('lässt bei „all" jede Gattung durch', () => {
    for (const item of [agent, recipe, task, favRecipe])
      expect(matchesAgenturaType('all', item)).toBe(true);
  });

  it('filtert je Gattung genau eine heraus', () => {
    expect(matchesAgenturaType('agent', agent)).toBe(true);
    expect(matchesAgenturaType('agent', recipe)).toBe(false);
    expect(matchesAgenturaType('recipe', recipe)).toBe(true);
    expect(matchesAgenturaType('task', task)).toBe(true);
    expect(matchesAgenturaType('task', recipe)).toBe(false);
  });

  // Der Punkt, an dem das frühere Favoriten-Regal hängt: `fav` ist quer zu den
  // Gattungen, nicht eine von ihnen.
  it('behandelt „fav" als Markierung über alle Gattungen', () => {
    expect(matchesAgenturaType('fav', favRecipe)).toBe(true);
    expect(matchesAgenturaType('fav', recipe)).toBe(false);
    expect(matchesAgenturaType('fav', { kind: 'agent', isFavorite: true })).toBe(true);
  });
});

describe('pinnedFirst', () => {
  it('zieht Angeheftetes nach vorn und hält beide Gruppen in Reihenfolge', () => {
    const items = [
      { id: 'a', pinned: false },
      { id: 'b', pinned: true },
      { id: 'c', pinned: false },
      { id: 'd', pinned: true },
    ];
    expect(pinnedFirst(items, (i) => i.pinned).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('lässt eine Liste ohne Angeheftetes unverändert', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(pinnedFirst(items, () => false)).toEqual(items);
  });
});
