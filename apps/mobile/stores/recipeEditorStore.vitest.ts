import { EMPTY_RECIPE_FORM } from '@gruenerator/shared/grueneratoren';
import { beforeEach, describe, expect, it } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import {
  NEW_RECIPE_TARGET,
  migrateRecipeDraft,
  recipeEditorTarget,
  shouldKeepDraft,
  useRecipeEditorStore,
} from './recipeEditorStore';

beforeEach(() => {
  __resetAsyncStorage();
  useRecipeEditorStore.getState().clear();
});

describe('recipeEditorStore', () => {
  it('marks the draft dirty on update and clears it', () => {
    useRecipeEditorStore.getState().begin(NEW_RECIPE_TARGET, EMPTY_RECIPE_FORM);
    expect(useRecipeEditorStore.getState().dirty).toBe(false);
    useRecipeEditorStore.getState().update({ title: 'Einladung' });
    expect(useRecipeEditorStore.getState().form.title).toBe('Einladung');
    expect(useRecipeEditorStore.getState().dirty).toBe(true);
    useRecipeEditorStore.getState().clear();
    expect(useRecipeEditorStore.getState().target).toBeNull();
    expect(useRecipeEditorStore.getState().form).toEqual(EMPTY_RECIPE_FORM);
  });

  it('targets edits case-insensitively', () => {
    expect(recipeEditorTarget('Presse')).toBe('presse');
    expect(recipeEditorTarget(null)).toBe(NEW_RECIPE_TARGET);
  });
});

describe('shouldKeepDraft', () => {
  it('keeps only drafts of the same target', () => {
    expect(shouldKeepDraft({ target: 'a', dirty: true }, 'b')).toBe(false);
    expect(shouldKeepDraft({ target: 'a', dirty: true }, 'a')).toBe(true);
  });

  it('reloads an untouched edit draft but keeps a new one', () => {
    expect(shouldKeepDraft({ target: 'a', dirty: false }, 'a')).toBe(false);
    expect(shouldKeepDraft({ target: NEW_RECIPE_TARGET, dirty: false }, NEW_RECIPE_TARGET)).toBe(
      true
    );
  });
});

describe('migrateRecipeDraft', () => {
  it('drops unreadable drafts', () => {
    expect(migrateRecipeDraft(null).target).toBeNull();
    expect(migrateRecipeDraft({ target: 'neu', form: { title: 1 } }).target).toBeNull();
  });

  it('fills missing fields from the empty form', () => {
    const { originalMention, ...rest } = EMPTY_RECIPE_FORM;
    void originalMention;
    const migrated = migrateRecipeDraft({
      target: 'neu',
      dirty: true,
      form: { ...rest, title: 'X' },
    });
    expect(migrated.dirty).toBe(true);
    expect(migrated.form.title).toBe('X');
    expect(migrated.form.originalMention).toBeNull();
  });
});
