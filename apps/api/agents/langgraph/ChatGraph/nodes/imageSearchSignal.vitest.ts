import { describe, it, expect } from 'vitest';

import { wantsImageResults } from './classifierHeuristics.js';
import { parseClassifierResponse } from './classifierParsing.js';

/**
 * `wantsImageResults` decides whether the web search should ask Linkup for
 * image hits — an opt-in, paid capability (`includeImages`/`bilder`), off by
 * default. Generation ("erstell ein Bild von X") and lookup ("zeig mir Bilder
 * von X") share every noun and differ only in the verb, but they route to
 * entirely different subsystems: image generation vs. the web search. Getting
 * it wrong in the expensive direction pays for stock links on a generation
 * turn; getting it wrong in the cheap direction costs one clarifying turn. So
 * the heuristic is deliberately narrow, and `bilder: true` as an explicit tool
 * argument is the escape hatch for phrasings this heuristic misses.
 *
 * It is now only HALF the decision. The other half is the classifier's own
 * `bilder` verdict on the subject, which is what makes "wer war Marilyn Monroe"
 * show pictures without anyone having asked for them — a regex cannot separate a
 * person from a tax calculation. This heuristic stays because it is the half that
 * survives every tier that never reaches the model.
 *
 * The plural cases are not decoration. The gate's first draft reused the
 * singular-only image-noun patterns that gate the edit and generation paths, and
 * neither of them matches "Bilder" or "Fotos" — the boundary assertion after
 * "bild" fails inside "bilder". That silently broke the feature in both
 * directions at once: the most ordinary German phrasing ("zeig mir Bilder von
 * der Demo") never fired, AND the negation guard, fed the same pattern, could not
 * see the noun in "zeig mir keine Fotos" and let a refusal through as a request.
 * Hence `IMAGE_LOOKUP_NOUN_PATTERN`, and hence these tests.
 */
describe('wantsImageResults', () => {
  describe('lookup phrasings (user wants to SEE existing images) return true', () => {
    it('detects a "zeig" request for an image', () => {
      expect(wantsImageResults('zeig mir Bilder von der Demo')).toBe(true);
    });

    it('detects a "gibt es" existence question', () => {
      expect(wantsImageResults('gibt es Fotos von dem Protest?')).toBe(true);
    });

    it('detects a "such" request', () => {
      expect(wantsImageResults('such mir Bilder zum Windrad-Ausbau')).toBe(true);
    });

    it('detects a "finde" request', () => {
      expect(wantsImageResults('finde Fotos von der Kundgebung')).toBe(true);
    });

    it('detects a "hast du" possession question', () => {
      expect(wantsImageResults('hast du Bilder davon?')).toBe(true);
    });

    it('detects a bare noun phrase at the start with no verb at all', () => {
      expect(wantsImageResults('Bilder von der Demo in Leipzig')).toBe(true);
    });
  });

  describe('generation phrasings return false (the expensive mistake)', () => {
    it('vetoes "erstell"', () => {
      expect(wantsImageResults('erstell ein Bild von einem Windrad')).toBe(false);
    });

    it('vetoes "generier"', () => {
      expect(wantsImageResults('generier mir ein Foto')).toBe(false);
    });

    it('vetoes "zeichne"', () => {
      expect(wantsImageResults('zeichne ein Bild')).toBe(false);
    });

    it('vetoes "mal"', () => {
      expect(wantsImageResults('mal mir ein Bild von einer Wiese')).toBe(false);
    });

    it('vetoes "illustrier"', () => {
      expect(wantsImageResults('illustrier mir ein Bild zur Statistik')).toBe(false);
    });

    it('a create verb vetoes even when a lookup verb is also present', () => {
      // "such" alone would fire the lookup path, but "erstell" names what the
      // user actually wants built FROM the found motif — buying stock links
      // for a generation request is the expensive mistake this guards against.
      expect(wantsImageResults('such ein Motiv und erstell daraus ein Bild')).toBe(false);
    });
  });

  describe('edit phrasings return false', () => {
    it('vetoes "bearbeite"', () => {
      expect(wantsImageResults('bearbeite das Foto')).toBe(false);
    });

    it('vetoes "ändere"', () => {
      expect(wantsImageResults('ändere das Bild')).toBe(false);
    });
  });

  describe('negation / meta phrasings return false', () => {
    it('does not fire on "ohne Bilder bitte"', () => {
      expect(wantsImageResults('ohne Bilder bitte')).toBe(false);
    });

    it('does not fire on "keine Fotos"', () => {
      expect(wantsImageResults('keine Fotos')).toBe(false);
    });
  });

  describe('no image noun at all returns false', () => {
    it('does not fire on a plain data question', () => {
      expect(wantsImageResults('zeig mir die Zahlen zum Windkraftausbau')).toBe(false);
    });

    it('does not fire on a document search', () => {
      expect(wantsImageResults('such nach dem Wahlprogramm')).toBe(false);
    });
  });

  describe('image noun in prose with no lookup verb returns false', () => {
    it('does not fire on a statement about an image already in view', () => {
      expect(wantsImageResults('das Bild oben ist gut')).toBe(false);
    });

    it('does not fire on "Grafik" prose (not a recognised lookup noun)', () => {
      expect(wantsImageResults('die Grafik zeigt den Trend')).toBe(false);
    });
  });

  describe('German plurals — the phrasings people actually use', () => {
    it('fires on plural "Bilder" with a lookup verb', () => {
      // The gate's first draft rejected exactly this sentence: the shared
      // singular-only noun patterns stop at "bild" and find no word boundary
      // inside "bilder", so the noun gate failed before "zeig" was ever read.
      expect(wantsImageResults('zeig mir Bilder von der Demo')).toBe(true);
    });

    it('fires on plural "Aufnahmen"', () => {
      expect(wantsImageResults('gibt es Aufnahmen von der Rede?')).toBe(true);
    });

    it('vetoes a refusal phrased with a plural noun', () => {
      // The counterpart failure: with a singular-only pattern the negation guard
      // could not see "Fotos", so an explicit "keine" passed straight through and
      // a refusal was billed as a request.
      expect(wantsImageResults('zeig mir keine Fotos bitte')).toBe(false);
    });

    it('does not fire on a compound that merely starts with an image noun', () => {
      // "Bildschirm" and "Bilderrahmen" contain the noun but are not it — the
      // trailing boundary is what keeps the plural alternation honest.
      expect(wantsImageResults('zeig mir den Bildschirm')).toBe(false);
      expect(wantsImageResults('such mir Bilderrahmen')).toBe(false);
    });
  });
});

/**
 * The classifier's half of the decision: does the SUBJECT deserve pictures?
 *
 * Read off the `bilder` field of its JSON answer, through the real parser rather
 * than a copy of the one line that reads it — a test that restates the
 * implementation agrees with it by construction and guards nothing.
 */
describe('classifier image verdict', () => {
  const answer = (fields: Record<string, unknown>) =>
    JSON.stringify({
      intent: 'web',
      searchQuery: 'Marilyn Monroe',
      reasoning: 'Person',
      ...fields,
    });

  it('carries a true verdict through', () => {
    expect(
      parseClassifierResponse(answer({ bilder: true }), 'wer war marilyn monroe').wantsImages
    ).toBe(true);
  });

  it('reads a missing field as no, not as undefined', () => {
    expect(parseClassifierResponse(answer({}), 'wer war marilyn monroe').wantsImages).toBe(false);
  });

  it('says no for a subject with nothing to look at', () => {
    expect(
      parseClassifierResponse(answer({ bilder: false }), 'wie berechne ich die grunderwerbsteuer')
        .wantsImages
    ).toBe(false);
  });

  it('does not accept a truthy non-boolean', () => {
    // Models return `"true"` often enough that the difference matters: a string
    // would sail through a truthiness check and turn the verdict into "always".
    expect(parseClassifierResponse(answer({ bilder: 'true' }), 'x').wantsImages).toBe(false);
    expect(parseClassifierResponse(answer({ bilder: 1 }), 'x').wantsImages).toBe(false);
  });
});
