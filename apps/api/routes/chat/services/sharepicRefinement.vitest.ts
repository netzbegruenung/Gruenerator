import { describe, it, expect } from 'vitest';

import { orderMayMeanArtifact, orderText } from './orderText.js';
import { namesSharepicTarget } from './sharepicEditHeuristics.js';
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

/** Beide Sharepic-Türen fragen den Auftrag (`orderText`), nicht den Stoff (#3912). */
describe('Sharepic-Weichen lesen den Auftrag, nicht den Stoff', () => {
  const paste =
    'Unser Antrag für den Stadtrat: Die Innenstadt soll kürzer getaktete Busse bekommen, und die Radwege an der Hauptstraße werden verbreitert. Außerdem fordern wir mehr Bäume am Marktplatz.';

  it('„kürzer" im eingefügten Text holt keine Überarbeitung', () => {
    const text = `${paste}\n\nübersetze das ins Englische`;
    expect(isSharepicRefinement(text)).toBe(true);
    expect(isSharepicRefinement(orderText(text))).toBe(false);
  });

  it('ein echter Überarbeitungsauftrag greift weiter', () => {
    expect(isSharepicRefinement(orderText('mach den Text kürzer'))).toBe(true);
  });
});

/** #3918: ein Auftrag ohne Ziel über eingefügtem Stoff meint den Stoff, nicht das Sharepic. */
describe('Sharepic-Überarbeitung: ein Auftrag ohne Ziel über eingefügtem Stoff meint den Stoff', () => {
  const paste =
    'Unser Ortsverband lädt am Samstag zum Radfahr-Aktionstag ein: Treffpunkt ist um 10 Uhr am Rathausplatz, danach fahren wir gemeinsam die neue Fahrradstraße ab und sammeln Ideen für den Stadtrat.';

  it.each([[`${paste}\n\nmach es kürzer`], [`${paste}\n\nkürzer bitte`]])(
    'greift nicht: %s',
    (message) => {
      expect(isSharepicRefinement(orderText(message))).toBe(true);
      expect(orderMayMeanArtifact(message, namesSharepicTarget)).toBe(false);
    }
  );

  it('ein Auftrag, der das Sharepic nennt, greift weiter', () => {
    const message = `${paste}\n\nmach das Sharepic kürzer`;
    expect(isSharepicRefinement(orderText(message))).toBe(true);
    expect(orderMayMeanArtifact(message, namesSharepicTarget)).toBe(true);
  });

  it('ohne Stoff bleibt es beim Sharepic', () => {
    expect(orderMayMeanArtifact('mach es kürzer', namesSharepicTarget)).toBe(true);
  });
});

/** Final-Review PR #3922: Gruß und Dank am Rand verdrängen den Auftrag nicht. */
it('Sharepic-Auftrag zwischen Gruß und Dank greift', () => {
  const message = 'Hallo!\n\nmach das Sharepic kürzer\n\nDanke';
  expect(isSharepicRefinement(orderText(message))).toBe(true);
  expect(orderMayMeanArtifact(message, namesSharepicTarget)).toBe(true);
});
