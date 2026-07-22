import { describe, it, expect } from 'vitest';

import {
  stripQuotedSpans,
  isNegatedArtifactRequest,
  isMetaQuestionAbout,
  negatedOrMeta,
} from './fastPathGuards.js';

const SHAREPIC = /\b(share[\s-]?pics?|sharepics?)\b/i;
const GRAFIK = /\b(bild|grafik|illustration|foto|image|poster)\b/i;
const TABELLE = /\b(tabelle|spreadsheet|sheets?|kalkulation(?:stabelle)?)\b/i;

describe('stripQuotedSpans', () => {
  it('removes German, guillemet, and straight double quotes', () => {
    expect(stripQuotedSpans('Er meinte: „Erstell ein Sharepic" — okay?')).not.toMatch(/sharepic/i);
    expect(stripQuotedSpans('Er sagte »mach ein Bild« dazu')).not.toMatch(/\bbild\b/i);
    expect(stripQuotedSpans('Titel "Grafik des Jahres" prüfen')).not.toMatch(/grafik/i);
  });
  it('keeps apostrophes / straight single quotes intact', () => {
    expect(stripQuotedSpans("wie viele Fuß sind das, geht's?")).toContain("geht's");
  });
});

describe('isNegatedArtifactRequest', () => {
  it('detects a negator before the noun', () => {
    expect(isNegatedArtifactRequest('ich will kein Sharepic, nur Text', SHAREPIC)).toBe(true);
    expect(isNegatedArtifactRequest('bitte ohne Bild antworten', GRAFIK)).toBe(true);
    expect(isNegatedArtifactRequest('mach daraus bitte keine Grafik', GRAFIK)).toBe(true);
    expect(isNegatedArtifactRequest('nicht als Tabelle bitte', TABELLE)).toBe(true);
  });
  it('does not cross a sentence boundary', () => {
    expect(isNegatedArtifactRequest('Nicht schlecht! Erstell ein Sharepic', SHAREPIC)).toBe(false);
  });
  it('is per-noun-family', () => {
    // "kein" negates Post, not Sharepic.
    expect(isNegatedArtifactRequest('statt eines Posts ein Sharepic', SHAREPIC)).toBe(false);
  });
  it('passes a plain create request', () => {
    expect(isNegatedArtifactRequest('erstell ein Sharepic zur Verkehrswende', SHAREPIC)).toBe(
      false
    );
  });
});

describe('isMetaQuestionAbout', () => {
  it('detects question-word-initial meta questions', () => {
    expect(isMetaQuestionAbout('Was macht ein gutes Sharepic aus?', SHAREPIC)).toBe(true);
    expect(isMetaQuestionAbout('Welche Schriftgröße hat ein Sharepic?', SHAREPIC)).toBe(true);
  });
  it('does not fire on imperative create requests', () => {
    expect(isMetaQuestionAbout('Erstell ein Sharepic zu Tempo 30', SHAREPIC)).toBe(false);
    expect(isMetaQuestionAbout('Zeig mir ein Balkendiagramm', GRAFIK)).toBe(false);
  });
});

describe('negatedOrMeta', () => {
  it('combines both guards', () => {
    expect(negatedOrMeta('Was macht ein gutes Sharepic aus?', SHAREPIC)).toBe(true);
    expect(negatedOrMeta('ich will kein Sharepic', SHAREPIC)).toBe(true);
    expect(negatedOrMeta('erstell ein Sharepic zur Verkehrswende', SHAREPIC)).toBe(false);
  });
});
