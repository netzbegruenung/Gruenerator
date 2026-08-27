/**
 * The recipe split has to live in ONE place.
 *
 * Web renders it as sublabels inside a single "Rezepte" section, mobile as
 * standalone `SectionList` titles. Both call `splitRecipesByOrigin`; only the
 * wording differs. When the rule was copied instead, the copy went stale —
 * "aus deinen Gruppen" was an unreachable branch on both platforms (#2876) and
 * the popover's indices drifted from the keyboard list (#2874).
 */

import { describe, expect, it } from 'vitest';

import {
  recipeOriginOf,
  splitRecipesByOrigin,
  RECIPE_ORIGIN_SECTION_TITLES,
  RECIPE_ORIGIN_SUBLABELS,
  type RecipeOrigin,
} from './mentionSections';

import type { Mentionable } from './mentionables';

function recipe(title: string, extra: Partial<Mentionable> = {}): Mentionable {
  return {
    type: 'agent',
    category: 'skill',
    trigger: '@',
    identifier: title,
    title,
    description: '',
    avatar: '🤖',
    backgroundColor: '#316049',
    mention: title.toLowerCase(),
    ...extra,
  };
}

describe('recipeOriginOf', () => {
  it('reads a group share, a saved prompt, and falls back to own', () => {
    expect(recipeOriginOf(recipe('geteilt', { sharedFromGroup: 'KV Köln' }))).toBe('group');
    expect(recipeOriginOf(recipe('gespeichert', { savedFromOwner: 'Alex Grün' }))).toBe('saved');
    // Saved, but the profile join found no name — still not the user's own.
    expect(recipeOriginOf(recipe('namenlos', { savedFromOwner: null }))).toBe('saved');
    expect(recipeOriginOf(recipe('eigen'))).toBe('own');
  });
});

describe('splitRecipesByOrigin', () => {
  it('orders the buckets and drops the empty ones', () => {
    const groups = splitRecipesByOrigin(
      [recipe('Mitgeliefert')],
      [
        recipe('Gespeichert', { savedFromOwner: 'Alex Grün' }),
        recipe('Eigen'),
        recipe('Geteilt', { sharedFromGroup: 'KV Köln' }),
      ]
    );

    expect(groups.map((g) => g.origin)).toEqual(['bundled', 'own', 'group', 'saved']);
    expect(groups.map((g) => g.items.map((m) => m.title))).toEqual([
      ['Mitgeliefert'],
      ['Eigen'],
      ['Geteilt'],
      ['Gespeichert'],
    ]);
  });

  it('keeps every recipe exactly once, in one bucket', () => {
    const all = [
      recipe('Eigen'),
      recipe('Geteilt', { sharedFromGroup: 'KV Köln' }),
      recipe('Gespeichert', { savedFromOwner: 'Alex Grün' }),
    ];
    const flat = splitRecipesByOrigin([recipe('Mitgeliefert')], all).flatMap((g) => g.items);

    expect(flat).toHaveLength(4);
    expect(new Set(flat.map((m) => m.title)).size).toBe(4);
  });

  it('returns nothing when there is nothing to show', () => {
    expect(splitRecipesByOrigin([], [])).toEqual([]);
  });

  it('does not invent an origin for a plain recipe', () => {
    const groups = splitRecipesByOrigin([], [recipe('Eigen')]);
    expect(groups).toEqual([{ origin: 'own', items: [recipe('Eigen')] }]);
  });
});

describe('origin labels', () => {
  // The maps are what each platform renders. A new origin without a label on
  // one of them is a section with no heading — the compiler catches it via
  // `Record<RecipeOrigin, string>`, this catches an empty string slipping in.
  it('labels every origin on both platforms', () => {
    const origins = Object.keys(RECIPE_ORIGIN_SUBLABELS) as RecipeOrigin[];
    expect(origins.length).toBeGreaterThan(0);
    expect(Object.keys(RECIPE_ORIGIN_SECTION_TITLES).sort()).toEqual([...origins].sort());
    for (const origin of origins) {
      expect(RECIPE_ORIGIN_SUBLABELS[origin]).not.toBe('');
      expect(RECIPE_ORIGIN_SECTION_TITLES[origin]).not.toBe('');
    }
  });
});
