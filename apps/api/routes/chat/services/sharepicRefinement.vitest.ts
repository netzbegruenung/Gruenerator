import { describe, it, expect } from 'vitest';

import { isSharepicRefinement } from './sharepicVariantHelpers.js';

/**
 * The second door into the sharepic edit branch. `isSharepicEditInstruction`
 * needs verb AND noun, but the refinement check fires on a single word — which
 * is why "Kürze danach nur die Pressemitteilung" captured a turn whose actual
 * job was to CREATE two documents.
 */
describe('isSharepicRefinement', () => {
  it('lässt die Multi-Intent-Erstellung durch, obwohl sie ein Edit-Wort enthält', () => {
    expect(
      isSharepicRefinement(
        'Schreib einen Instagram-Post UND eine Pressemitteilung zum Thema Windkraft. Kürze danach nur die Pressemitteilung.'
      )
    ).toBe(false);
  });

  it('erkennt eine echte Verfeinerung weiterhin', () => {
    expect(isSharepicRefinement('Mach es knackiger')).toBe(true);
    expect(isSharepicRefinement('Kürzer bitte')).toBe(true);
    expect(isSharepicRefinement('anderes Bild')).toBe(true);
  });

  it('bleibt bei einer Nachricht ohne Edit-Wort negativ', () => {
    expect(isSharepicRefinement('Wer ist Bundesvorsitzende?')).toBe(false);
  });

  /**
   * REFINE_PATTERN fires on a SINGLE everyday word, so any question containing
   * one was read as an edit command. "sachlich", "anders" and "mach es" are
   * ordinary German, not sharepic vocabulary.
   */
  it('frisst keine Rückfragen mehr, die zufällig ein Edit-Wort enthalten', () => {
    expect(isSharepicRefinement('Ist das sachlich korrekt?')).toBe(false);
    expect(isSharepicRefinement('Ist die Zahl wirklich richtig?')).toBe(false);
    expect(isSharepicRefinement('Stimmt das, oder hast du das geändert?')).toBe(false);
  });

  it('lässt höfliche Änderungswünsche in Frageform weiterhin durch', () => {
    // Diese Grenze ist der Grund, warum kein blanker "?"-Test genügt.
    expect(isSharepicRefinement('Kannst du das kürzer machen?')).toBe(true);
    expect(isSharepicRefinement('Magst du ein anderes Bild nehmen?')).toBe(true);
  });
});
