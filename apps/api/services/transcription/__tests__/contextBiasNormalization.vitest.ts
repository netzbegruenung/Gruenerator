/**
 * Two production failures, pinned so they cannot come back quietly.
 *
 * Both were invisible for the same reason: the transcription provider chain
 * catches a provider error and continues on the next one, so a hard 4xx from
 * Voxtral looked like "Regolo answered" rather than like a bug. They only
 * surfaced when a real recording was pushed through the real code path.
 */

import { describe, expect, it } from 'vitest';

import {
  buildContextBias,
  MAX_CONTEXT_BIAS_TERMS,
  normalizeContextBias,
} from '../transcriptionBias.js';

/** What Mistral rejects: whitespace, commas, slashes inside one entry. */
const ILLEGAL = /[\s,/]/;

describe('normalizeContextBias', () => {
  it('splits phrases into single words', () => {
    // Verbatim from the HTTP 400: "Context bias item 'Die Linke' must not
    // contain commas or whitespace".
    expect(normalizeContextBias(['Die Linke'])).toEqual(['Die', 'Linke']);
  });

  it('treats slashes as separators', () => {
    expect(normalizeContextBias(['Bündnis 90/Die Grünen'])).toEqual([
      'Bündnis',
      '90',
      'Die',
      'Grünen',
    ]);
  });

  it('keeps the surname rather than dropping the entry', () => {
    // The whole point of splitting instead of filtering: 'Gewessler' is exactly
    // the word the model gets wrong, and a filter would have thrown it away
    // together with the first name.
    expect(normalizeContextBias(['Leonore Gewessler'])).toContain('Gewessler');
  });

  it('strips punctuation that would travel into the entry', () => {
    expect(normalizeContextBias(['„Jänner",'])).toEqual(['Jänner']);
  });

  it('deduplicates while preserving order', () => {
    expect(normalizeContextBias(['Die Linke', 'Die Grünen'])).toEqual(['Die', 'Linke', 'Grünen']);
  });

  it('drops entries that are only punctuation', () => {
    expect(normalizeContextBias(['—', '  ', ','])).toEqual([]);
  });

  it('respects the provider cap', () => {
    const many = Array.from({ length: MAX_CONTEXT_BIAS_TERMS + 50 }, (_, i) => `wort${i}`);
    expect(normalizeContextBias(many)).toHaveLength(MAX_CONTEXT_BIAS_TERMS);
  });
});

describe('buildContextBias — every term must be sendable', () => {
  // The regression itself: 13 of the 31 German terms were phrases, so EVERY
  // Voxtral call from the subtitler failed with HTTP 400.
  for (const locale of ['de-DE', 'de-AT'] as const) {
    it(`${locale} yields only single words`, () => {
      const terms = buildContextBias(locale);

      expect(terms.length).toBeGreaterThan(0);
      expect(terms.length).toBeLessThanOrEqual(MAX_CONTEXT_BIAS_TERMS);
      expect(terms.filter((t) => ILLEGAL.test(t))).toEqual([]);
      expect(terms.filter((t) => t === '')).toEqual([]);
    });
  }

  it('still carries the proper nouns the phrases contained', () => {
    const de = buildContextBias('de-DE');
    for (const surname of ['Habeck', 'Baerbock', 'Özdemir']) {
      expect(de).toContain(surname);
    }

    const at = buildContextBias('de-AT');
    for (const surname of ['Gewessler', 'Kogler', 'Zadić']) {
      expect(at).toContain(surname);
    }
  });
});
