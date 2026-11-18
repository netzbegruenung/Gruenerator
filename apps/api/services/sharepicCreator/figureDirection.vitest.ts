import { describe, expect, it } from 'vitest';

import { unbackedDirections } from './briefFacts.js';
import { validateDraft } from './draftValidation.js';

/** #5480: the press release the live turn drew on. */
const RADWEG =
  'Mach aus der Pressemitteilung ein Sharepic: Der Kreistag hat den Bau des Radwegs beschlossen. Die 2,4 km lange Strecke gilt seit Jahren als Unfallschwerpunkt: Allein 2025 registrierte die Polizei dort 17 Unfälle mit Radfahrenden. Das Land fördert den Bau mit 1,26 Mio. €.';

const infografik = (titel: string) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'hellgrau' },
      position: 'oben',
      align: 'zentriert',
      logo: false,
      items: [
        { type: 'headline', lines: ['Radweg', 'kommt'] },
        {
          type: 'infografik',
          form: 'raster',
          punkte: [
            { titel, icon: 'fahrrad' },
            { titel: '2,4 km', icon: 'bahn' },
          ],
        },
      ],
    },
  ],
});

describe('what a text says about a figure (#5480)', () => {
  it('rejects a tile that turns the accidents into a reduction', () => {
    const checked = validateDraft(infografik('17 Unfälle weniger'), 'de-DE', RADWEG);
    expect(!checked.ok && checked.error).toMatch(/"17 Unfälle weniger" sagt über 17 etwas anderes/);
  });

  it('passes the same figure as the brief states it', () => {
    expect(validateDraft(infografik('17 Unfälle'), 'de-DE', RADWEG).ok).toBe(true);
  });

  it('passes a reduction the brief reports', () => {
    const brief = 'Seit dem Radweg (2,4 km) gab es dort 17 Unfälle weniger als vorher.';
    expect(validateDraft(infografik('17 Unfälle weniger'), 'de-DE', brief).ok).toBe(true);
  });

  it('rejects the opposite direction of the one the brief gives', () => {
    expect(unbackedDirections('12 Unfälle mehr', 'Es gab 12 Unfälle weniger.')).toEqual(['12']);
    expect(unbackedDirections('3 Dezibel lauter', 'Der Lärm sank um 3 Dezibel.')).toEqual(['3']);
  });

  it('accepts a synonym of the brief’s direction', () => {
    expect(
      unbackedDirections('420.000 € gespart', 'Der Kreis spart damit 420.000 € im Jahr.')
    ).toEqual([]);
    expect(unbackedDirections('3 Dezibel leiser', 'Der Lärm sank um 3 Dezibel.')).toEqual([]);
  });

  it('reads only direction words next to the figure', () => {
    expect(
      unbackedDirections(
        'Mehr Busse für alle Dörfer – 3.300 Fahrgäste betroffen',
        'Rund 3.300 Fahrgäste täglich.'
      )
    ).toEqual([]);
  });

  it('leaves a number the brief lacks to the number check', () => {
    expect(unbackedDirections('5 Unfälle weniger', RADWEG)).toEqual([]);
  });
});
