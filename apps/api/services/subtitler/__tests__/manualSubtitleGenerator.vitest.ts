import { describe, it, expect } from 'vitest';

import {
  generateManualSubtitles,
  groupWordsIntoSegments,
  sanitizeWordTimestamps,
  trimOuterPunctuation,
  type WordTimestamp,
} from '../manualSubtitleGeneratorService.js';

describe('sanitizeWordTimestamps', () => {
  it('repairs a leading zero-duration cue (the start=0,end=0 provider artifact)', () => {
    const words: WordTimestamp[] = [
      { word: 'Hallo', start: 0, end: 0 },
      { word: 'Welt', start: 0.5, end: 1.0 },
    ];
    const cleaned = sanitizeWordTimestamps(words);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].start).toBe(0);
    expect(cleaned[0].end).toBeGreaterThan(cleaned[0].start);
  });

  it('clamps negative starts to 0', () => {
    const cleaned = sanitizeWordTimestamps([{ word: 'a', start: -1, end: 0.5 }]);
    expect(cleaned[0].start).toBe(0);
    expect(cleaned[0].end).toBe(0.5);
  });

  it('enforces monotonically non-decreasing starts', () => {
    const cleaned = sanitizeWordTimestamps([
      { word: 'a', start: 2.0, end: 2.5 },
      { word: 'b', start: 1.0, end: 1.5 },
    ]);
    expect(cleaned[1].start).toBeGreaterThanOrEqual(cleaned[0].start);
  });

  it('drops structurally invalid entries (non-finite timing)', () => {
    const cleaned = sanitizeWordTimestamps([
      { word: 'a', start: NaN, end: 1 },
      { word: 'b', start: 0.5, end: 1.0 },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].word).toBe('b');
  });

  it('throws only when nothing usable remains (silent/empty audio)', () => {
    expect(() => sanitizeWordTimestamps([])).toThrow(/No usable word timestamps/);
    expect(() => sanitizeWordTimestamps([{ word: 'x', start: Infinity, end: Infinity }])).toThrow(
      /No usable word timestamps/
    );
  });
});

describe('generateManualSubtitles', () => {
  it('produces subtitles for input whose first word has start=0,end=0 (no longer aborts)', async () => {
    const words: WordTimestamp[] = [
      { word: 'Hallo', start: 0, end: 0 },
      { word: 'liebe', start: 0.4, end: 0.8 },
      { word: 'Welt.', start: 0.9, end: 1.4 },
    ];
    const result = await generateManualSubtitles('Hallo liebe Welt.', words);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('trimOuterPunctuation', () => {
  it('strips punctuation only at the edges', () => {
    expect(trimOuterPunctuation('Welt.')).toBe('Welt');
    expect(trimOuterPunctuation('(Zwischenruf)')).toBe('Zwischenruf');
    expect(trimOuterPunctuation('ja?!')).toBe('ja');
  });

  it('keeps word-internal punctuation, which also appears in the transcript', () => {
    expect(trimOuterPunctuation("geht's")).toBe("geht's");
    expect(trimOuterPunctuation("'ne")).toBe("'ne");
    expect(trimOuterPunctuation('Kfz-Mechaniker,')).toBe('Kfz-Mechaniker');
  });
});

describe('groupWordsIntoSegments position mapping', () => {
  // Casing is the discriminator: a mapped segment is sliced out of fullText and
  // keeps its capital "W", the word-join fallback would echo the lowercase tokens.
  it('maps contractions instead of falling back to word join', () => {
    const fullText = "Weil geht's ihm gut.";
    const words: WordTimestamp[] = [
      { word: 'weil', start: 0, end: 0.4 },
      { word: "geht's", start: 0.4, end: 0.8 },
      { word: 'ihm', start: 0.8, end: 1.2 },
      { word: 'gut.', start: 1.2, end: 1.6 },
    ];
    const segments = groupWordsIntoSegments(words, fullText);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Weil geht's ihm gut.");
  });

  it('maps hyphenated compounds', () => {
    const fullText = 'Er war Kfz-Mechaniker damals.';
    const words: WordTimestamp[] = [
      { word: 'er', start: 0, end: 0.4 },
      { word: 'war', start: 0.4, end: 0.8 },
      { word: 'Kfz-Mechaniker', start: 0.8, end: 1.4 },
      { word: 'damals.', start: 1.4, end: 1.8 },
    ];
    const segments = groupWordsIntoSegments(words, fullText);
    expect(segments.map((s) => s.text).join(' ')).toContain('Kfz-Mechaniker');
  });

  it('skips tokens that are pure punctuation without derailing the cursor', () => {
    const fullText = 'Ja, genau so.';
    const words: WordTimestamp[] = [
      { word: 'Ja,', start: 0, end: 0.4 },
      { word: '--', start: 0.4, end: 0.5 },
      { word: 'genau', start: 0.5, end: 0.9 },
      { word: 'so.', start: 0.9, end: 1.3 },
    ];
    const segments = groupWordsIntoSegments(words, fullText);
    expect(segments.map((s) => s.text).join(' ')).toContain('genau so.');
  });
});
