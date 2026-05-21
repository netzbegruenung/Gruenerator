import { describe, it, expect } from 'vitest';

import {
  generateManualSubtitles,
  sanitizeWordTimestamps,
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
