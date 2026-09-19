import { type TextForm } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_RECIPE_FORM,
  draftToRecipeForm,
  effectiveMention,
  hydrateRecipeForm,
  recipeFormToPayload,
  type RecipeFormState,
} from './recipeFormState';

const CUSTOM_FORM: TextForm = {
  id: '1',
  kind: 'custom',
  textType: null,
  mention: 'omv-einladungen',
  title: 'OMV-Einladungen',
  examples: [{ content: 'Eins' }, { content: 'Zwei' }],
  styleBlock: 'Kurz und knapp.',
  model: null,
  analyzedAt: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  sharedWithGroups: [],
  sharedFromGroup: null,
  ownerName: null,
  description: 'Für OMV-Einladungen',
  iconKey: 'PiEnvelope',
  shareMode: 'private',
  isPublic: false,
  publicOwnership: null,
};

const PRESET_FORM: TextForm = {
  ...CUSTOM_FORM,
  id: '2',
  kind: 'preset',
  textType: 'presse',
  mention: 'presse',
  title: 'Pressemitteilungen',
};

describe('effectiveMention', () => {
  it('uses the fixed mention for a preset/recipe form', () => {
    const form: RecipeFormState = { ...EMPTY_RECIPE_FORM, fixedMention: 'presse', mention: '' };
    expect(effectiveMention(form)).toBe('presse');
  });

  it('derives a slug from the title until the mention field is touched', () => {
    const form: RecipeFormState = { ...EMPTY_RECIPE_FORM, title: 'OMV Einladungen' };
    expect(effectiveMention(form)).toBe('omv-einladungen');
  });

  it('keeps the user-typed mention once touched', () => {
    const form: RecipeFormState = {
      ...EMPTY_RECIPE_FORM,
      title: 'OMV Einladungen',
      mention: 'omv-custom',
      mentionTouched: true,
    };
    expect(effectiveMention(form)).toBe('omv-custom');
  });

  it("keeps a hydrated custom form's mention when only the title changes", () => {
    const hydrated = hydrateRecipeForm(CUSTOM_FORM);
    const editedTitle = { ...hydrated, title: 'Ein ganz anderer Titel' };
    expect(effectiveMention(editedTitle)).toBe(CUSTOM_FORM.mention);
  });
});

describe('recipeFormToPayload', () => {
  it('splits the raw examples field and trims text fields', () => {
    const form: RecipeFormState = {
      ...EMPTY_RECIPE_FORM,
      kind: 'custom',
      title: '  OMV-Einladungen  ',
      description: '  Für OMV-Einladungen  ',
      styleBlock: '  Kurz und knapp.  ',
      rawExamples: 'Eins\n\n---\n\nZwei',
    };
    expect(recipeFormToPayload(form)).toEqual({
      kind: 'custom',
      textType: null,
      title: 'OMV-Einladungen',
      examples: [{ content: 'Eins' }, { content: 'Zwei' }],
      styleBlock: 'Kurz und knapp.',
      description: 'Für OMV-Einladungen',
      iconKey: EMPTY_RECIPE_FORM.iconKey,
    });
  });

  it('maps an empty description to null, never an empty string', () => {
    const form: RecipeFormState = { ...EMPTY_RECIPE_FORM, description: '   ' };
    expect(recipeFormToPayload(form).description).toBeNull();
  });
});

describe('hydrateRecipeForm', () => {
  it('hydrates a custom form with fixedMention null and joined examples', () => {
    const form = hydrateRecipeForm(CUSTOM_FORM);
    expect(form.kind).toBe('custom');
    expect(form.fixedMention).toBeNull();
    expect(form.mention).toBe('omv-einladungen');
    expect(form.rawExamples).toBe('Eins\n\n---\n\nZwei');
  });

  it('hydrates a preset form with fixedMention set to its mention', () => {
    const form = hydrateRecipeForm(PRESET_FORM);
    expect(form.kind).toBe('preset');
    expect(form.fixedMention).toBe('presse');
    expect(form.textType).toBe('presse');
  });

  it('round-trips examples through split/join', () => {
    const form = hydrateRecipeForm(CUSTOM_FORM);
    const payload = recipeFormToPayload(form);
    expect(payload.examples).toEqual(CUSTOM_FORM.examples);
  });
});

describe('draftToRecipeForm', () => {
  it('maps a drafted spec into a custom, mention-touched partial form', () => {
    const partial = draftToRecipeForm({
      title: 'OMV-Einladungen',
      mention: 'omv-einladungen',
      description: 'Für OMV-Einladungen',
      iconKey: 'PiEnvelope',
      styleBlock: 'Kurz und knapp.',
    });
    expect(partial).toEqual({
      kind: 'custom',
      fixedMention: null,
      mention: 'omv-einladungen',
      mentionTouched: true,
      title: 'OMV-Einladungen',
      description: 'Für OMV-Einladungen',
      iconKey: 'PiEnvelope',
      styleBlock: 'Kurz und knapp.',
    });
    expect(effectiveMention({ ...EMPTY_RECIPE_FORM, ...partial })).toBe('omv-einladungen');
  });
});
