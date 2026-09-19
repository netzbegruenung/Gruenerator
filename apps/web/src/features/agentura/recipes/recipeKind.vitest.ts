import { describe, expect, it } from 'vitest';

import { PRESETS, classifyRecipeMention } from './recipeKind';

describe('classifyRecipeMention', () => {
  it('classifies a preset mention', () => {
    const result = classifyRecipeMention('presse', null);
    expect(result).toEqual({
      kind: 'preset',
      mention: 'presse',
      textType: 'presse',
      label: 'Pressemitteilungen',
      hint: 'Pressetexte',
      entitled: true,
    });
  });

  it('classifies an entitled Landesverband recipe', () => {
    const result = classifyRecipeMention('presse-berlin-partei', ['berlin']);
    expect(result.kind).toBe('recipe');
    expect(result.mention).toBe('presse-berlin-partei');
    expect(result.textType).toBe('presse');
    expect(result.entitled).toBe(true);
  });

  it('classifies a non-entitled Landesverband recipe', () => {
    const result = classifyRecipeMention('presse-berlin-partei', ['hamburg']);
    expect(result.kind).toBe('recipe');
    expect(result.entitled).toBe(false);
  });

  it('an Instagram Landesverband recipe resolves to the instagram preset textType', () => {
    const result = classifyRecipeMention('insta-berlin', ['berlin']);
    expect(result.kind).toBe('recipe');
    expect(result.textType).toBe('instagram');
    expect(result.entitled).toBe(true);
  });

  it('lvIds === null (roles not yet known) does not gate a Landesverband recipe', () => {
    const result = classifyRecipeMention('presse-berlin-partei', null);
    expect(result.kind).toBe('recipe');
    expect(result.entitled).toBe(true);
  });

  it('classifies a custom mention', () => {
    const result = classifyRecipeMention('omv-einladungen', null);
    expect(result).toEqual({
      kind: 'custom',
      mention: 'omv-einladungen',
      textType: null,
      label: 'omv-einladungen',
      hint: 'omv-einladungen',
      entitled: true,
    });
  });

  it('an unknown mention that looks like a slug falls back to custom', () => {
    const result = classifyRecipeMention('nicht-existent-xyz', ['berlin']);
    expect(result.kind).toBe('custom');
    expect(result.entitled).toBe(true);
  });

  it('every preset textType round-trips through classifyRecipeMention', () => {
    for (const preset of PRESETS) {
      const result = classifyRecipeMention(preset.textType, null);
      expect(result.kind).toBe('preset');
      expect(result.textType).toBe(preset.textType);
    }
  });
});
