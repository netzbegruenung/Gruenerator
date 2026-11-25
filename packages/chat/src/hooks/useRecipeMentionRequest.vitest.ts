import { describe, expect, it } from 'vitest';

import { textformToMentionable } from '../lib/mentionables';

import { resolveRecipeLink } from './useRecipeMentionRequest';

const ownForm = textformToMentionable({
  id: 'row-1',
  mention: 'mein-rezept',
  title: 'Mein Rezept',
  description: null,
  iconKey: null,
  sharedFromGroup: null,
  ownerName: null,
  isPublic: false,
});

describe('resolveRecipeLink', () => {
  it('resolves a system recipe from the registry without waiting', () => {
    const m = resolveRecipeLink({ mention: 'presse', recipeId: null }, null);
    expect(m?.category).toBe('skill');
    expect(m?.mention).toBe('presse');
  });

  it('returns null for an unknown system mention', () => {
    expect(resolveRecipeLink({ mention: 'gibt-es-nicht', recipeId: null }, null)).toBeNull();
  });

  it('waits for the recipe list before resolving a user recipe', () => {
    expect(resolveRecipeLink({ mention: 'mein-rezept', recipeId: 'row-1' }, null)).toBeNull();
  });

  it('takes the saved recipe from the list', () => {
    expect(resolveRecipeLink({ mention: 'mein-rezept', recipeId: 'row-1' }, [ownForm])).toBe(
      ownForm
    );
  });

  it('falls back to a chip carrying the row id for a recipe outside the list', () => {
    const m = resolveRecipeLink({ mention: 'fremd', recipeId: 'row-9' }, [ownForm]);
    expect(m).toMatchObject({
      type: 'textform',
      category: 'skill',
      identifier: 'row-9',
      mention: 'fremd',
    });
  });
});
