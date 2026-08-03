import { describe, expect, it } from 'vitest';

import { convertGermanNumberWords, germanNumberWordToDigits } from '../germanNumberWords.js';

describe('germanNumberWordToDigits', () => {
  it('converts cardinals, compounds and years', () => {
    expect(germanNumberWordToDigits('zwei')).toBe('2');
    expect(germanNumberWordToDigits('zehn')).toBe('10');
    expect(germanNumberWordToDigits('fünfundvierzig')).toBe('45');
    expect(germanNumberWordToDigits('dreihundert')).toBe('300');
    expect(germanNumberWordToDigits('zweitausendneunzehn')).toBe('2019');
    expect(germanNumberWordToDigits('zweitausendeinundzwanzig')).toBe('2021');
    expect(germanNumberWordToDigits('zwölfhundertneunundvierzig')).toBe('1249');
    expect(germanNumberWordToDigits('zweihundertachtzigtausend')).toBe('280000');
  });

  it('refuses every spelling of "one"', () => {
    // The exact class smart_format gets wrong: "von einer Bundestagswahl"
    // became "von 1 Bundestagswahl". Article and numeral are the same word.
    for (const form of ['ein', 'eine', 'einer', 'einem', 'einen', 'eins', 'Einer']) {
      expect(germanNumberWordToDigits(form)).toBeNull();
    }
  });

  it('still reads "ein" inside a compound, where it cannot be an article', () => {
    expect(germanNumberWordToDigits('einundzwanzig')).toBe('21');
  });

  it('leaves ordinals and non-numbers alone', () => {
    // "das Zweite ist natürlich" — smart_format turned this into "das 2. Ist".
    expect(germanNumberWordToDigits('zweite')).toBeNull();
    expect(germanNumberWordToDigits('erste')).toBeNull();
    expect(germanNumberWordToDigits('dreißigjährigen')).toBeNull();
    expect(germanNumberWordToDigits('Neunzigerjahren')).toBeNull();
    expect(germanNumberWordToDigits('Bundestagswahl')).toBeNull();
    expect(germanNumberWordToDigits('')).toBeNull();
  });

  it('keeps the punctuation the token arrived with', () => {
    expect(germanNumberWordToDigits('zehn,')).toBe('10,');
    expect(germanNumberWordToDigits('sieben.')).toBe('7.');
    expect(germanNumberWordToDigits('fünfzehn?')).toBe('15?');
  });

  it('is case-insensitive', () => {
    expect(germanNumberWordToDigits('Sieben')).toBe('7');
    expect(germanNumberWordToDigits('Tausend')).toBe('1000');
  });
});

describe('convertGermanNumberWords', () => {
  it('preserves the token count, which the subtitle position mapping relies on', () => {
    const input = 'Da stand sie bei sieben, acht, neun, zehn Prozent im Jahr zweitausendfünfzehn.';
    const output = convertGermanNumberWords(input);

    expect(output).toBe('Da stand sie bei 7, 8, 9, 10 Prozent im Jahr 2015.');
    expect(output.split(/\s+/)).toHaveLength(input.split(/\s+/).length);
  });

  it('preserves whitespace exactly', () => {
    expect(convertGermanNumberWords('zwei\n  drei')).toBe('2\n  3');
  });

  it('does not touch the article', () => {
    expect(convertGermanNumberWords('von einer Arbeitsmaßnahme in die nächste')).toBe(
      'von einer Arbeitsmaßnahme in die nächste'
    );
  });
});
