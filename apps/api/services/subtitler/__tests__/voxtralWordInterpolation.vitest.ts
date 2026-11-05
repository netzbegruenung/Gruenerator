import { describe, expect, it } from 'vitest';

import { interpolateWordTimestamps } from '../voxtralTranscriptionService.js';

describe('interpolateWordTimestamps', () => {
  it('spreads a segment over its words by length and covers it exactly', () => {
    const words = interpolateWordTimestamps({ text: ' Das ist wichtig.', start: 4, end: 5.4 });

    expect(words.map((w) => w.word)).toEqual(['Das', 'ist', 'wichtig.']);
    expect(words[0]!.start).toBe(4);
    expect(words[2]!.end).toBeCloseTo(5.4);
    // "wichtig." has 8 of 14 characters → 8/14 of the 1.4 s.
    expect(words[2]!.end - words[2]!.start).toBeCloseTo(0.8);
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBe(words[i - 1]!.end);
  });

  it('returns nothing for an empty segment', () => {
    expect(interpolateWordTimestamps({ text: '  ', start: 1, end: 2 })).toEqual([]);
  });
});
