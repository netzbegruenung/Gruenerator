import { describe, expect, it } from 'vitest';

import { findMatches, foldForSearch } from './conversationSearch';

/**
 * The fold has one job beyond being useful: it must never change the string's
 * length. Every offset produced here indexes back into the raw text to build a
 * DOM Range, so a mapping like ä→ae (which is what @gruenerator/query's
 * foldUmlauts does) would silently shift every highlight after the first umlaut.
 */
describe('foldForSearch', () => {
  it('preserves length for every character it folds', () => {
    for (const s of ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü', 'é', 'ñ', 'Straße', 'Grüne Wärme']) {
      expect(foldForSearch(s)).toHaveLength(s.length);
    }
  });

  it('preserves length across a surrogate pair', () => {
    const s = 'grün 🌻 wärme';
    expect(foldForSearch(s)).toHaveLength(s.length);
  });

  it('folds umlauts and case together', () => {
    expect(foldForSearch('GRÜNE')).toBe('grune');
  });
});

describe('findMatches', () => {
  it('finds an umlaut word typed without the umlaut', () => {
    expect(findMatches('Die Grüne Wärme', 'grune')).toEqual([{ start: 4, end: 9 }]);
  });

  it('finds an ASCII query typed in caps', () => {
    expect(findMatches('die grüne wärme', 'GRÜNE')).toEqual([{ start: 4, end: 9 }]);
  });

  it('does not equate ß with ss', () => {
    // Deliberate: ß→ss cannot preserve length. Documented in the module header.
    expect(findMatches('Hauptstraße', 'strasse')).toEqual([]);
    expect(findMatches('Hauptstraße', 'straße')).toHaveLength(1);
  });

  it('treats the query literally, not as a pattern', () => {
    expect(findMatches('nutze C++ dafür', 'c++')).toEqual([{ start: 6, end: 9 }]);
    expect(findMatches('1.5 Grad', '1.5')).toHaveLength(1);
    expect(findMatches('1x5 Grad', '1.5')).toEqual([]);
    expect(findMatches('wirklich?', '?')).toEqual([]); // below the minimum
  });

  it('does not overlap matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('ignores a query below the minimum length', () => {
    expect(findMatches('windkraft', 'w')).toEqual([]);
    expect(findMatches('windkraft', '  ')).toEqual([]);
  });
});
