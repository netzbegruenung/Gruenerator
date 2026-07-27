import { describe, expect, it } from 'vitest';

import { classifyLegacyImageType, isKiImage } from './contentOrigin.js';

/**
 * This is the classification that put KI images under "Sharepics" in production.
 * Two things have to hold: the legacy fallback must recognise every value the
 * old write paths could produce, and `contentOrigin` must win over it whenever
 * the backend sends one — otherwise a corrected row keeps being re-guessed from
 * the string that was wrong in the first place.
 */

describe('classifyLegacyImageType', () => {
  it('recognises the canonical KI ids the bild-editor writes', () => {
    for (const type of ['green-edit', 'universal-edit', 'pure-create', 'ai-editor']) {
      expect(classifyLegacyImageType(type)).toBe('ki');
    }
  });

  it('recognises the two legacy aliases still sitting in old rows', () => {
    expect(classifyLegacyImageType('imagine')).toBe('ki');
    expect(classifyLegacyImageType('edit')).toBe('ki');
  });

  it('recognises every template legacyType, including the Austrian variants', () => {
    for (const type of [
      'Dreizeilen',
      'Zitat',
      'Zitat_Pure',
      'Info',
      'Simple',
      'Slider',
      'Veranstaltung',
      'Profilbild',
      'Freeform',
      'InfoAt',
      'ZitatAt',
      'ZitatPureAt',
      'DreizeilenAt',
      'FreeformAt',
    ]) {
      expect(classifyLegacyImageType(type)).toBe('sharepic');
    }
  });

  it('returns unknown for the empty string the draft autosave used to send', () => {
    // `typeConfig?.legacyType || type || ''` — the '' branch is why NULL rows
    // exist at all, so it must not be mistaken for either bucket.
    expect(classifyLegacyImageType('')).toBe('unknown');
    expect(classifyLegacyImageType(null)).toBe('unknown');
    expect(classifyLegacyImageType(undefined)).toBe('unknown');
  });

  it('recognises the lowercase canvas config ids too', () => {
    // The canvas editor passes its config id through as `image_type`, a second
    // spelling for the same templates. Real rows carry it, and before this it
    // matched nothing — those sharepics were classified only by the default.
    for (const type of ['dreizeilen', 'zitat', 'zitat-pure', 'info-at', 'freeform']) {
      expect(classifyLegacyImageType(type)).toBe('sharepic');
    }
  });

  it('leaves the literal "sharepic" unknown, because it certifies nothing', () => {
    // Mobile's share modal writes it for KI results and template results alike.
    // Claiming 'sharepic' here would launder a value we know to be unreliable.
    expect(classifyLegacyImageType('sharepic')).toBe('unknown');
  });

  it('returns unknown rather than guessing for an unrecognised value', () => {
    expect(classifyLegacyImageType('was-auch-immer')).toBe('unknown');
    expect(classifyLegacyImageType('PURE-CREATE')).toBe('unknown');
  });
});

describe('isKiImage', () => {
  it('trusts contentOrigin over the legacy string', () => {
    // The whole point: a row the backfill labelled correctly must not be
    // re-derived from the image_type that was wrong to begin with.
    expect(isKiImage({ contentOrigin: 'ki', imageType: 'Dreizeilen' })).toBe(true);
    expect(isKiImage({ contentOrigin: 'sharepic', imageType: 'pure-create' })).toBe(false);
  });

  it('treats an explicit unknown as not-KI without consulting the string', () => {
    expect(isKiImage({ contentOrigin: 'unknown', imageType: 'pure-create' })).toBe(false);
  });

  it('falls back to the legacy classification when the backend sent nothing', () => {
    // Old backend, no column — this is the pre-existing behaviour, preserved.
    expect(isKiImage({ imageType: 'pure-create' })).toBe(true);
    expect(isKiImage({ imageType: 'Dreizeilen' })).toBe(false);
    expect(isKiImage({ contentOrigin: null, imageType: 'imagine' })).toBe(true);
  });

  it('puts an unclassifiable image among the sharepics, as before', () => {
    expect(isKiImage({})).toBe(false);
    expect(isKiImage({ imageType: '' })).toBe(false);
  });
});
