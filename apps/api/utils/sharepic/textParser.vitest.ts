import { describe, it, expect } from 'vitest';

import {
  isAttributionLine,
  parseLabeledText,
  truncateAtSentence,
  truncateField,
} from './textParser.js';

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

describe('parseLabeledText — attribution lines never enter a field', () => {
  it('drops the fabricated source line the Kickl sharepic shipped', () => {
    // Live bug: zitat_pure declares only a ZITAT label, so every following line
    // was appended to the quote — including an invented "ORF-Interview" source
    // that the template has no field for and that read as a real citation.
    const raw = [
      'ZITAT: "Ich verachte den Rechtsstaat."',
      '— Herbert Kickl, ORF-Interview, 3.3.2026',
    ].join('\n');
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.success).toBe(true);
    expect(result.data['zitat']).toBe('"Ich verachte den Rechtsstaat."');
    expect(result.data['zitat']).not.toContain('ORF');
    expect(result.data['zitat']).not.toContain('Kickl');
  });

  it('drops an explicit Quelle: line', () => {
    const raw = 'ZITAT: Klimaschutz ist Menschenschutz.\nQuelle: Umweltbundesamt 2026';
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.data['zitat']).toBe('Klimaschutz ist Menschenschutz.');
  });

  it('keeps a genuine multi-line quote intact', () => {
    const raw = [
      'ZITAT: Wir haben es in der Hand.',
      'Jede Tonne CO2 zählt, und jede Entscheidung auch.',
    ].join('\n');
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.data['zitat']).toBe(
      'Wir haben es in der Hand.\nJede Tonne CO2 zählt, und jede Entscheidung auch.'
    );
  });
});

describe('isAttributionLine', () => {
  it('matches attribution shapes', () => {
    for (const line of [
      '— Herbert Kickl, ORF-Interview, 3.3.2026',
      '– Studie des Umweltbundesamts, 2026',
      'Quelle: ORF',
      '(Quelle: Der Standard, 2026)',
      'Foto: Anna Muster',
    ]) {
      expect(isAttributionLine(line), line).toBe(true);
    }
  });

  it('does not match ordinary content', () => {
    for (const line of [
      'Jede Tonne CO2 zählt, und jede Entscheidung auch.',
      'Wir handeln jetzt.',
      '— und genau deshalb brauchen wir endlich eine echte Verkehrswende in diesem Land',
      'Klimaschutz, Gerechtigkeit und Demokratie gehören zusammen, das ist unser Kompass.',
    ]) {
      expect(isAttributionLine(line), line).toBe(false);
    }
  });
});
