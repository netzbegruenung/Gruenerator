import { describe, expect, it } from 'vitest';

import { claimsByCitation, supportingSentence } from './citationQuote.js';

const CHUNK =
  'Die Kommune plant eine kommunale Wärmeplanung bis 2028. ' +
  'Dafür werden alle Gebäude im Stadtgebiet erfasst. ' +
  'Fernwärme soll vor allem in der Innenstadt ausgebaut werden. ' +
  'Die Kosten trägt zu großen Teilen das Land.';

describe('claimsByCitation', () => {
  it('takes the answer sentence in front of each marker', () => {
    const claims = claimsByCitation(
      'Einleitung ohne Beleg. Fernwärme wird in der Innenstadt ausgebaut [cite:1]. Das Land zahlt [cite:2].'
    );
    expect(claims.get('1')).toEqual(['Fernwärme wird in der Innenstadt ausgebaut']);
    expect(claims.get('2')).toEqual(['Das Land zahlt']);
  });

  it('gives markers after the full stop and stacked markers the same sentence', () => {
    const claims = claimsByCitation(
      'Erster Satz. Die Wärmeplanung kommt bis 2028.[cite:1][cite:2]'
    );
    expect(claims.get('1')).toEqual(['Die Wärmeplanung kommt bis 2028']);
    expect(claims.get('2')).toEqual(['Die Wärmeplanung kommt bis 2028']);
  });

  it('reads source links too', () => {
    const claims = claimsByCitation('Laut [Wärmeplan](quelle:3) kommt Fernwärme.');
    expect(claims.get('3')).toEqual(['Laut [Wärmeplan']);
  });
});

describe('supportingSentence', () => {
  it('picks the chunk sentence with the most shared content words', () => {
    expect(supportingSentence(CHUNK, ['Fernwärme wird in der Innenstadt ausgebaut'])).toBe(
      'Fernwärme soll vor allem in der Innenstadt ausgebaut werden.'
    );
  });

  it('returns null when no sentence shares two content words', () => {
    expect(supportingSentence(CHUNK, ['Radwege werden saniert'])).toBeNull();
    expect(supportingSentence(CHUNK, [])).toBeNull();
  });

  it('lets the question lift a short claim and break ties, never stand alone', () => {
    expect(supportingSentence(CHUNK, ['Das Land zahlt'], 'Wer trägt die Kosten?')).toBe(
      'Die Kosten trägt zu großen Teilen das Land.'
    );
    expect(
      supportingSentence(CHUNK, ['Radwege werden saniert'], 'Wer trägt die Kosten?')
    ).toBeNull();
  });

  it('skips blocks too long to be a sentence', () => {
    const table = `| Fernwärme | Innenstadt | ${'x '.repeat(300)}|`;
    expect(supportingSentence(table, ['Fernwärme in der Innenstadt'])).toBeNull();
  });
});
