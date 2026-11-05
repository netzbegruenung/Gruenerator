import { describe, expect, it } from 'vitest';

import { type SharepicSlide } from '@gruenerator/contracts';

import { placeIn, terminAnswer, terminGapInstruction, terminGapProblems } from './terminGap.js';

const ANSWER = 'Donnerstag, 20.11., 19 Uhr im Bürgerhaus Linden, Am Lindenplatz 4';
const slide = (extra: Pick<SharepicSlide, 'ort' | 'datum'> = {}) => extra;

describe('terminGap', () => {
  it('round-trips the person’s answer through the instruction', () => {
    expect(terminAnswer(terminGapInstruction(ANSWER))).toBe(ANSWER);
    expect(terminAnswer('Mach die Headline größer')).toBeNull();
  });

  it('finds the place after date, time and weekday', () => {
    expect(placeIn(ANSWER)).toBe('Bürgerhaus Linden, Am Lindenplatz 4');
    expect(placeIn('Do., 20.11., 18 Uhr, Kreisbüro')).toBe('Kreisbüro');
    expect(placeIn('am Samstag, 14.11. um 10:30')).toBeNull();
    expect(placeIn('Freitag ab 18 Uhr')).toBeNull();
  });

  // Live 05.11.2026: the revision set `datum` and left out the named place and weekday.
  it('asks for a named place and weekday the draft left out', () => {
    const problems = terminGapProblems(ANSWER, [
      slide({ datum: { date: '20.11.', time: '19 Uhr' } }),
    ]);
    expect(problems).toContain('„Bürgerhaus Linden, Am Lindenplatz 4“');
    expect(problems).toContain('weekday');
  });

  it('is content once place and weekday stand on a slide', () => {
    const done = slide({
      datum: { weekday: 'Donnerstag', date: '20.11.', time: '19 Uhr' },
      ort: { lines: ['Bürgerhaus Linden', 'Am Lindenplatz 4'] },
    });
    expect(terminGapProblems(ANSWER, [done])).toBeNull();
    expect(terminGapProblems('20.11., 19 Uhr', [slide({ datum: { date: '20.11.' } })])).toBeNull();
  });
});
