import { describe, it, expect } from 'vitest';

import {
  stripQuotedSpans,
  isNegatedArtifactRequest,
  isMetaQuestionAbout,
  negatedOrMeta,
  hasExplicitSharepicWord,
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

/**
 * The single gate for "may this turn produce a sharepic?". Before it, nine call
 * sites each carried their own sharepic vocabulary and their own (or no)
 * guards — "Grafik"/"Kachel" quietly counted, and the sites that forgot the
 * guards were the doors sharepics appeared through unasked-for.
 */
describe('hasExplicitSharepicWord', () => {
  it('accepts every spelling of the word', () => {
    for (const t of [
      'Mach ein Sharepic zu Tempo 30',
      'Erstell ein Share-Pic zum Kohleausstieg',
      'Ich brauche zwei Sharepics',
      'Bau mir ein Spruchbild',
      'Mach was aus den Spruchbildern',
      'Ein Zitatbild bitte',
      'Mach mir einen Dreizeiler zum Radverkehr',
      'Info-Sharepic zur Kindergrundsicherung',
      'Zitat-Sharepic: Wir kämpfen für Klimaschutz',
    ]) {
      expect(hasExplicitSharepicWord(t), t).toBe(true);
    }
  });

  it('rejects the words that used to be treated as sharepic asks', () => {
    // This is the product rule, not a detail: "Grafik" means a chart at least
    // as often as a party template, and routing it to the sharepic generator
    // was the single biggest source of unwanted sharepics.
    for (const t of [
      'Erstell daraus eine Grafik',
      'Ich brauche eine Kachel mit den Fakten',
      'Mal mir ein Bild dazu',
      'Mach ein Poster',
      'Schreib einen Insta-Post zu Tempo 30',
    ]) {
      expect(hasExplicitSharepicWord(t), t).toBe(false);
    }
  });

  it('stands down on negation', () => {
    expect(hasExplicitSharepicWord('Schreib einen Post ohne Sharepic')).toBe(false);
    expect(hasExplicitSharepicWord('Ich will ausdrücklich kein Sharepic')).toBe(false);
  });

  it('stands down on a question ABOUT sharepics', () => {
    expect(hasExplicitSharepicWord('Was macht ein gutes Sharepic aus?')).toBe(false);
    expect(hasExplicitSharepicWord('Wie erstelle ich ein Sharepic?')).toBe(false);
  });

  it('but a question about something ELSE does not disarm a real ask', () => {
    // The meta guard is anchored to the start of the TEXT, so judging a
    // two-sentence message by its first word refused perfectly explicit asks:
    // the question is the research half, the sharepic is the request.
    expect(
      hasExplicitSharepicWord(
        'Was ist unsere Position zur Mietpreisbremse? Mach ein Sharepic draus'
      )
    ).toBe(true);
    expect(
      hasExplicitSharepicWord('Wie hat die Fraktion abgestimmt? Pack das in ein Sharepic')
    ).toBe(true);
  });

  it('treats a quoted sharepic word as reported speech, not an ask', () => {
    expect(
      hasExplicitSharepicWord('Ein Kollege schrieb: „Erstell doch mal ein Sharepic dazu"')
    ).toBe(false);
    expect(hasExplicitSharepicWord('Suche nach "Sharepic Vorlagen" und fasse zusammen')).toBe(
      false
    );
  });

  it('survives empty and nullish input', () => {
    expect(hasExplicitSharepicWord('')).toBe(false);
    expect(hasExplicitSharepicWord(undefined as unknown as string)).toBe(false);
  });
});
