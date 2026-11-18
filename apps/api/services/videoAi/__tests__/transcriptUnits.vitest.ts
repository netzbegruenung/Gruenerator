import { describe, expect, it } from 'vitest';

import { clipUnits } from '../projectTypes.js';
import {
  buildTranscriptUnits,
  findUnitBreaks,
  pulledHook,
  unitsFromBreaks,
} from '../transcriptUnits.js';

import { radwegUnits, radwegWords } from './fixtures.js';

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe('buildTranscriptUnits', () => {
  it('ends a unit at sentence punctuation', () => {
    const units = buildTranscriptUnits('c1', [
      w('Hallo.', 0, 0.4),
      w('Ich', 0.5, 0.6),
      w('bin', 0.6, 0.8),
      w('da!', 0.8, 1),
    ]);
    expect(units.map((u) => [u.id, u.text])).toEqual([
      ['c1.s1', 'Hallo.'],
      ['c1.s2', 'Ich bin da!'],
    ]);
    expect(units[0].pauseAfter).toBeCloseTo(0.1);
    expect(units[1].pauseAfter).toBeNull();
  });

  it('ends a unit at a long pause even without punctuation', () => {
    const units = buildTranscriptUnits('c2', [
      w('Wir', 0, 0.2),
      w('haben', 0.2, 0.5),
      w('Moment', 1.3, 1.7),
    ]);
    expect(units.map((u) => u.text)).toEqual(['Wir haben', 'Moment']);
    expect(units[1].id).toBe('c2.s2');
  });

  it('cuts the raw take into the units the spike worked with', () => {
    const units = radwegUnits();
    expect(units.get('c1.s12')?.text).toBe('Die CSU hat das abgelehnt.');
    expect(units.get('c1.s13')?.text).toBe('Das find ich nicht in Ordnung.');
    expect(units.get('c1.s16')?.text).toBe('Die CSU hat den Antrag leider abgelehnt.');
    // Number words arrive as digits, as listenWithGreenpt delivers them.
    expect(units.get('c1.s8')?.text).toContain('über 400 Kinder');
  });
});

describe('stored unit breaks', () => {
  it('splits at stored breaks even when the current rules would split elsewhere', () => {
    const words = radwegWords().slice(0, 12);
    const units = unitsFromBreaks('c1', words, [0, 5]);
    expect(units.map((u) => [u.id, u.words.length])).toEqual([
      ['c1.s1', 5],
      ['c1.s2', 7],
    ]);
  });

  it('round-trips: breaks of the current rules rebuild the same units', () => {
    const words = radwegWords();
    expect(unitsFromBreaks('c1', words, findUnitBreaks(words))).toEqual(
      buildTranscriptUnits('c1', words)
    );
  });

  it('falls back to the current rules for a clip stored without breaks', () => {
    const words = radwegWords();
    expect(clipUnits({ clipId: 'c1', words })).toEqual(buildTranscriptUnits('c1', words));
  });
});

describe('pulledHook', () => {
  it('names the first unit only when it was said after the second', () => {
    expect(pulledHook(['c1.s8', 'c1.s5', 'c1.s6'])).toBe('c1.s8');
    expect(pulledHook(['c2.s1', 'c1.s5'])).toBe('c2.s1');
    expect(pulledHook(['c1.s5', 'c1.s6'])).toBeNull();
    expect(pulledHook(['c1.s5'])).toBeNull();
  });
});
