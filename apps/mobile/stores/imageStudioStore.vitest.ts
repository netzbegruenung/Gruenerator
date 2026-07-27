import { beforeEach, describe, expect, it } from 'vitest';

import {
  selectHasResult,
  selectIsGenerating,
  useImageStudioStore,
  type ImageStudioFormData,
} from './imageStudioStore';

import type { DreizeilenModificationParams, NormalizedTextResult } from '@gruenerator/shared';

/**
 * The image-studio store carries the whole create flow across four expo-router
 * screens, so leaked state between runs shows up as a half-filled form on the
 * next attempt. These tests pin the reset boundaries and the modification
 * cloning — `updateModification` deep-clones on purpose, and an accidental
 * in-place mutation would silently break undo/regenerate.
 */

const state = () => useImageStudioStore.getState();

beforeEach(() => {
  state().reset();
});

describe('form data', () => {
  it('merges single field updates instead of replacing the form', () => {
    state().updateField('thema', 'Klimaschutz');
    state().updateField('name', 'Anna');

    expect(state().formData).toEqual({ thema: 'Klimaschutz', name: 'Anna' });
  });

  it('merges bulk updates over existing fields', () => {
    state().updateField('thema', 'Klimaschutz');
    state().updateFields({ name: 'Anna', thema: 'Verkehrswende' } as ImageStudioFormData);

    expect(state().formData).toEqual({ thema: 'Verkehrswende', name: 'Anna' });
  });
});

describe('uploaded image', () => {
  it('clears the stock attribution along with the image', () => {
    // Attribution belongs to the image that was replaced; leaving it behind
    // credits an Unsplash photographer for a photo the user has since swapped.
    state().setUploadedImage('file:///a.jpg', 'BASE64');
    state().setStockImageAttribution({
      photographer: 'Jane',
      profileUrl: 'https://example.test/jane',
      photoUrl: 'https://example.test/a.jpg',
    });

    state().clearUploadedImage();

    expect(state().uploadedImageUri).toBeNull();
    expect(state().uploadedImageBase64).toBeNull();
    expect(state().stockImageAttribution).toBeNull();
  });
});

describe('generated text and alternatives', () => {
  const result: NormalizedTextResult = {
    fields: { headline: 'Haupt' },
    alternatives: [{ headline: 'Alt 1' }, { headline: 'Alt 2' }],
  } as NormalizedTextResult;

  it('auto-applies the main result and selects index 0', () => {
    state().setGeneratedText(result);

    expect(state().selectedAlternativeIndex).toBe(0);
    expect(state().formData).toMatchObject({ headline: 'Haupt' });
  });

  it('applies the alternative at index-1, since 0 is the main result', () => {
    state().setGeneratedText(result);
    state().selectAlternative(1);
    state().applyAlternative();

    expect(state().formData).toMatchObject({ headline: 'Alt 1' });
  });

  it('reverts to the main result when index 0 is re-applied', () => {
    state().setGeneratedText(result);
    state().selectAlternative(2);
    state().applyAlternative();
    expect(state().formData).toMatchObject({ headline: 'Alt 2' });

    state().selectAlternative(0);
    state().applyAlternative();
    expect(state().formData).toMatchObject({ headline: 'Haupt' });
  });

  it('leaves the form untouched when the selected alternative does not exist', () => {
    state().setGeneratedText(result);
    state().selectAlternative(99);
    state().applyAlternative();

    expect(state().formData).toMatchObject({ headline: 'Haupt' });
  });

  it('does nothing when no text has been generated', () => {
    state().updateField('headline', 'manuell');
    state().selectAlternative(1);
    state().applyAlternative();

    expect(state().formData).toMatchObject({ headline: 'manuell' });
  });
});

describe('modifications', () => {
  it('populates defaults for a type that supports them', () => {
    state().setType('dreizeilen');
    state().initModifications();

    expect(state().modifications).not.toBeNull();
  });

  it.each(['zitat', 'zitat-pure', 'veranstaltung'] as const)('supports %s', (type) => {
    state().setType(type);
    state().initModifications();

    expect(state().modifications).not.toBeNull();
  });

  it('stays null for a type without modifications', () => {
    state().setType('profilbild');
    state().initModifications();

    expect(state().modifications).toBeNull();
  });

  it('clears modifications when no type is selected at all', () => {
    state().setType('dreizeilen');
    state().initModifications();
    useImageStudioStore.setState({ type: null });

    state().initModifications();

    expect(state().modifications).toBeNull();
  });

  it('does not mutate the previous params object when updating one key', () => {
    state().setType('dreizeilen');
    state().initModifications();
    const before = state().modifications as DreizeilenModificationParams;
    const beforeFontSize = before.fontSize;

    state().updateModification('fontSize', beforeFontSize + 10);

    expect(state().modifications).not.toBe(before);
    expect(before.fontSize).toBe(beforeFontSize);
    expect((state().modifications as DreizeilenModificationParams).fontSize).toBe(
      beforeFontSize + 10
    );
  });

  it('deep-clones nested arrays so a mutation cannot leak across renders', () => {
    state().setType('dreizeilen');
    state().initModifications();
    const before = state().modifications as DreizeilenModificationParams;

    state().updateModification('fontSize', before.fontSize + 1);
    const after = state().modifications as DreizeilenModificationParams;

    expect(after.balkenOffset).not.toBe(before.balkenOffset);
    expect(after.balkenOffset).toEqual(before.balkenOffset);
  });

  it('ignores updates when modifications were never initialised', () => {
    state().updateModification('fontSize', 99);
    expect(state().modifications).toBeNull();
  });

  it('restores defaults after edits', () => {
    state().setType('dreizeilen');
    state().initModifications();
    const defaults = state().modifications as DreizeilenModificationParams;
    state().updateModification('fontSize', defaults.fontSize + 42);

    state().resetModifications();

    expect(state().modifications).toEqual(defaults);
  });
});

describe('KI options', () => {
  it('toggles an infrastructure option on and off', () => {
    state().toggleKiInfrastructureOption('trees');
    state().toggleKiInfrastructureOption('bike-lanes');
    expect(state().kiInfrastructureOptions).toEqual(['trees', 'bike-lanes']);

    state().toggleKiInfrastructureOption('trees');
    expect(state().kiInfrastructureOptions).toEqual(['bike-lanes']);
  });

  it('defaults the pre-selected flag to false when omitted', () => {
    state().setKiVariant('illustration-pure', true);
    expect(state().kiVariantPreSelected).toBe(true);

    state().setKiVariant('illustration-pure');
    expect(state().kiVariantPreSelected).toBe(false);
  });
});

describe('reset boundaries', () => {
  it('reset() wipes the whole flow, so the next create starts clean', () => {
    state().setType('dreizeilen');
    state().updateField('thema', 'Klimaschutz');
    state().setUploadedImage('file:///a.jpg', 'BASE64');
    state().initModifications();
    state().setError('kaputt');
    state().setAutoSaveStatus('saved');

    state().reset();

    expect(state().type).toBeNull();
    expect(state().formData).toEqual({});
    expect(state().uploadedImageUri).toBeNull();
    expect(state().modifications).toBeNull();
    expect(state().error).toBeNull();
    expect(state().autoSaveStatus).toBe('idle');
  });

  it('resetAutoSave() clears only the auto-save slice', () => {
    state().updateField('thema', 'Klimaschutz');
    state().setAutoSaveStatus('saved');
    state().setAutoSavedShareToken('tok');
    state().setLastAutoSavedImageSrc('data:image/png;base64,x');

    state().resetAutoSave();

    expect(state().autoSaveStatus).toBe('idle');
    expect(state().autoSavedShareToken).toBeNull();
    expect(state().lastAutoSavedImageSrc).toBeNull();
    expect(state().formData).toMatchObject({ thema: 'Klimaschutz' });
  });

  it('resetBgRemoval() clears only the background-removal slice', () => {
    state().setBgRemovalProgress(0.5, 'Freistellen …');
    state().setBgRemovalLoading(true);
    state().setError('kaputt');

    state().resetBgRemoval();

    expect(state().bgRemovalProgress).toBe(0);
    expect(state().bgRemovalMessage).toBeNull();
    expect(state().bgRemovalLoading).toBe(false);
    expect(state().error).toBe('kaputt');
  });
});

describe('selectors', () => {
  it('selectIsGenerating covers text, canvas and background removal', () => {
    expect(selectIsGenerating(state())).toBe(false);

    state().setTextLoading(true);
    expect(selectIsGenerating(state())).toBe(true);
    state().setTextLoading(false);

    state().setCanvasLoading(true);
    expect(selectIsGenerating(state())).toBe(true);
    state().setCanvasLoading(false);

    state().setBgRemovalLoading(true);
    expect(selectIsGenerating(state())).toBe(true);
  });

  it('selectIsGenerating ignores the generic loading flag', () => {
    state().setLoading(true);
    expect(selectIsGenerating(state())).toBe(false);
  });

  it('selectHasResult tracks the generated image', () => {
    expect(selectHasResult(state())).toBe(false);
    state().setGeneratedImage('BASE64');
    expect(selectHasResult(state())).toBe(true);
  });
});
