import { describe, it, expect } from 'vitest';

import { truncateAtSentence, truncateField } from './textParser.js';

describe('truncateField', () => {
  it('returns the value unchanged when within the limit', () => {
    expect(truncateField('short text', 50)).toBe('short text');
  });

  it('trims at a word boundary when one is reasonably close', () => {
    const value = 'one two three four five six seven eight';
    const result = truncateField(value, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    // Should not end mid-word.
    expect(value.startsWith(result)).toBe(true);
    expect(result.endsWith(' ')).toBe(false);
  });
});

describe('truncateAtSentence', () => {
  it('returns the value unchanged when within the limit', () => {
    const value = 'Ein kurzer Satz.';
    expect(truncateAtSentence(value, 100)).toBe(value);
  });

  it('cuts at the last sentence boundary within the limit (never mid-sentence)', () => {
    const value =
      'Der Rückgang der Biodiversität ist Realität. Bienen verschwinden aus unseren Feldern. Wir brauchen jetzt mehr Artenschutz und Handlungsdruck.';
    const result = truncateAtSentence(value, 90);
    expect(result.length).toBeLessThanOrEqual(90);
    // Ends on a complete sentence and never leaves a dangling next sentence.
    expect(/[.!?]$/.test(result)).toBe(true);
    expect(result.endsWith('Feldern.')).toBe(true);
    expect(result).not.toContain('Wir brauchen');
    expect(value.startsWith(result)).toBe(true);
  });

  it('handles ! and ? as sentence terminators', () => {
    const value = 'Schützt die Natur! Warum warten wir noch? Jetzt handeln und nicht später.';
    const result = truncateAtSentence(value, 30);
    expect(/[.!?]$/.test(result)).toBe(true);
    expect(result).toBe('Schützt die Natur!');
  });

  it('falls back to word-boundary truncation when no sentence break fits', () => {
    // A single long run with the only period far past the limit.
    const value = 'wort '.repeat(40) + 'ende.';
    const result = truncateAtSentence(value, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(/[.!?]$/.test(result)).toBe(false);
    expect(value.startsWith(result)).toBe(true);
  });
});
