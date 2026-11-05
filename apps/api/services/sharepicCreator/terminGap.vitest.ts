import { describe, expect, it } from 'vitest';

import { type SharepicSpec } from '@gruenerator/contracts';

import { placeIn, terminAnswer, terminGapInstruction, withTerminAnswer } from './terminGap.js';

const ANSWER = 'Donnerstag, 20.11., 19 Uhr im Bürgerhaus Linden, Am Lindenplatz 4';

const spec = (slide: Partial<SharepicSpec['slides'][number]>) =>
  ({
    slides: [
      {
        background: { kind: 'farbe', color: 'tanne' },
        position: 'unten',
        align: 'links',
        logo: true,
        items: [],
        ...slide,
      },
    ],
  }) as unknown as SharepicSpec;

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

  // Live 05.11.2026: three attempts set neither `ort` nor the weekday.
  it('puts the named place and weekday on the circle’s slide', () => {
    const out = withTerminAnswer(
      spec({ datum: { date: '20.11.', time: '19 Uhr' } }),
      terminGapInstruction(ANSWER)
    );
    expect(out.slides[0]!.datum).toEqual({ weekday: 'Donnerstag', date: '20.11.', time: '19 Uhr' });
    expect(out.slides[0]!.ort).toEqual({ lines: ['Bürgerhaus Linden', 'Am Lindenplatz 4'] });
  });

  it('keeps what the draft already has and leaves other orders alone', () => {
    const done = spec({ datum: { weekday: 'Do', date: '20.11.' }, ort: { lines: ['Kreisbüro'] } });
    expect(withTerminAnswer(done, terminGapInstruction(ANSWER))).toBe(done);
    const plain = spec({ datum: { date: '20.11.' } });
    expect(withTerminAnswer(plain, ANSWER)).toBe(plain);
    // No circle: nothing to attach the place to.
    const noCircle = spec({});
    expect(withTerminAnswer(noCircle, terminGapInstruction(ANSWER))).toBe(noCircle);
  });
});
