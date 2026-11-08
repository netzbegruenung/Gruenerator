import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const withText = (text: string) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'oben',
      align: 'links',
      items: [
        { type: 'headline', lines: ['Jetzt', 'handeln!'] },
        { type: 'text', text },
      ],
      logo: true,
    },
  ],
});

describe('numbers in a draft', () => {
  it('takes a formula like CO2 for a word, not for the number 2', () => {
    const result = validateDraft(
      withText('Wirksame CO2-Bepreisung'),
      'de-DE',
      'Kundgebung für Klimaschutz'
    );
    expect(result.ok).toBe(true);
  });

  it('still rejects a number the brief does not give', () => {
    const result = validateDraft(withText('Schon 300 Menschen dabei'), 'de-DE', 'Kundgebung');
    expect(!result.ok && result.error).toMatch(/nennt 300/);
  });
});

describe('a figure keeps its meaning in an infographic', () => {
  const tiles = (...punkte: { titel: string; text?: string }[]) => ({
    slides: [
      {
        background: { kind: 'farbe', color: 'hellgrau' },
        position: 'oben',
        align: 'zentriert',
        items: [
          { type: 'headline', lines: ['Zurück zum', 'Radweg'] },
          {
            type: 'infografik',
            form: 'raster',
            punkte: punkte.map((p) => ({ ...p, icon: 'fahrrad', motiv: 'a city bicycle' })),
          },
        ],
        logo: false,
      },
    ],
  });
  const hotspot = 'Allein 2025 registrierte die Polizei dort 17 Unfälle mit Radfahrenden.';

  it('rejects a direction the brief does not give next to the figure', () => {
    const result = validateDraft(
      tiles({ titel: '17 Unfälle weniger' }, { titel: 'Start im April' }),
      'de-DE',
      hotspot
    );
    expect(!result.ok && result.error).toMatch(/Richtung/);
  });

  it('accepts the direction when the brief says it', () => {
    const result = validateDraft(
      tiles({ titel: '17 Unfälle weniger' }, { titel: 'Start im April' }),
      'de-DE',
      'Die Zahl der Unfälle sank um 17.'
    );
    expect(result.ok).toBe(true);
  });

  // Review #5490: the title's „Mehr …" is another clause than the text's figure.
  it('does not lend a direction word to a figure in another clause', () => {
    const result = validateDraft(
      tiles({ titel: 'Mehr Radwege', text: '2,4 km Länge' }, { titel: 'Start im April' }),
      'de-DE',
      'Der Radweg ist 2,4 km lang.'
    );
    expect(result.ok).toBe(true);
  });

  it('still rejects the direction inside the same field', () => {
    const result = validateDraft(
      tiles(
        { titel: '17 Unfälle', text: 'Das sind 17 weniger als 2024.' },
        { titel: 'Start im April' }
      ),
      'de-DE',
      hotspot
    );
    expect(!result.ok && result.error).toMatch(/Richtung/);
  });

  // Review #5490: a direction on another „17" in the brief does not cover this one.
  it('does not let a direction on another figure with the same number count', () => {
    const result = validateDraft(
      tiles({ titel: '17 Unfälle weniger' }, { titel: 'Start im April' }),
      'de-DE',
      'Der Verkehr sank um 17 Prozent. Allein 2025 registrierte die Polizei dort 17 Unfälle mit Radfahrenden.'
    );
    expect(!result.ok && result.error).toMatch(/Richtung/);
  });

  it('accepts plain figures', () => {
    const result = validateDraft(
      tiles({ titel: '2,4 km' }, { titel: '1,26 Mio. €', text: 'Förderung vom Land' }),
      'de-DE',
      'Der Radweg ist 2,4 km lang und wird mit 1,26 Mio. € gefördert.'
    );
    expect(result.ok).toBe(true);
  });
});
