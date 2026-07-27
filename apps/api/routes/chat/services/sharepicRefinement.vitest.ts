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
});
