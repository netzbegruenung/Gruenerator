import { describe, expect, it } from 'vitest';

import { POLITIKFELD_NAMES } from '../LandtagNrwScraper/politikfelder.js';

import { berlinPolitikfelderOf, STAEMME } from './politikfelder.js';

describe('berlinPolitikfelderOf', () => {
  it('uses exactly the Politikfelder of the NRW notebook', () => {
    expect(Object.keys(STAEMME).sort()).toEqual([...POLITIKFELD_NAMES].sort());
  });

  it.each([
    [['Schule'], [], ['Bildung & Schule']],
    [['Radweg'], [], ['Verkehr & Mobilität']],
    [['Flüchtlingsunterbringung'], [], ['Migration, Integration & Religion']],
    [
      ['Friedhof'],
      ['Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen'],
      ['Bauen, Wohnen & Stadtentwicklung'],
    ],
    [[], ['Ausschuss für Mobilität und Verkehr'], ['Verkehr & Mobilität']],
  ])('%j / %j → %j', (sachgebiete, stellen, expected) => {
    expect(berlinPolitikfelderOf(sachgebiete, stellen)).toEqual(expected);
  });

  // Ohne das Abnehmen der Vorsilbe fiele jede Antwort des Senats unter „Verwaltung".
  it('does not read „Senatsverwaltung" as a topic', () => {
    expect(berlinPolitikfelderOf([], ['Senatsverwaltung für Finanzen'])).toEqual([
      'Haushalt & Finanzen',
    ]);
  });

  it('ignores factions and the Hauptausschuss', () => {
    expect(berlinPolitikfelderOf([], ['Grüne', 'Hauptausschuss'])).toEqual([]);
  });
});
