import { parseSharepicNumber } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const BRIEF =
  'Das Deutschlandticket kostet 63 €, der Arbeitgeber zahlt 5,75 € dazu, der Steuerbonus bringt 3,15 €. Termine: Mo 12.5. Radtour, Sa 17.5. Baumpflanzaktion.';

const slide = (items: object[], extra: object = {}) => ({
  background: { kind: 'farbe', color: 'mint' },
  position: 'oben',
  align: 'links',
  items,
  logo: false,
  ...extra,
});
const errorOf = (items: object[], extra: object = {}, brief = BRIEF) => {
  const result = validateDraft({ slides: [slide(items, extra)] }, 'de-DE', brief);
  return result.ok ? '' : result.error;
};
const rechnung = (ergebnis: string) => ({
  type: 'rechnung',
  glieder: [
    { wert: '63 €', label: 'Ticket' },
    { op: '−', wert: '5,75 €', label: 'Arbeitgeber' },
    { op: '−', wert: '3,15 €', label: 'Steuerbonus' },
  ],
  ergebnis: { wert: ergebnis, label: 'im Monat' },
});

describe('parseSharepicNumber', () => {
  it.each([
    ['63 €', 63],
    ['5,75 €', 5.75],
    ['1.234,5', 1234.5],
    ['−40°', -40],
    ['+3,1 °C', 3.1],
    ['Hohe Nachfrage', null],
  ])('%s → %s', (value, expected) => {
    expect(parseSharepicNumber(value)).toBe(expected);
  });
});

describe('validateDraft — rechnung', () => {
  it('takes a sum that adds up', () => {
    expect(errorOf([rechnung('54,10 €')], {}, `${BRIEF} Bleiben 54,10 €.`)).toBe('');
  });

  it('sends back a sum that does not', () => {
    expect(errorOf([rechnung('44,10 €')], {}, `${BRIEF} Bleiben 44,10 €.`)).toContain(
      'Die rechnung geht nicht auf'
    );
  });

  it('leaves a formula in words alone', () => {
    const formel = {
      type: 'rechnung',
      glieder: [{ wert: 'Hohe Nachfrage' }, { op: '+', wert: 'leere Speicher' }],
      ergebnis: { wert: 'teurer Strom' },
    };
    expect(errorOf([formel])).toBe('');
  });
});

describe('validateDraft — termine', () => {
  it('takes dates the brief names', () => {
    const termine = {
      type: 'termine',
      eintraege: [
        { datum: 'Mo 12.5.', titel: 'Radtour' },
        { datum: 'Sa 17.5.', titel: 'Baumpflanzaktion' },
      ],
    };
    expect(errorOf([termine])).toBe('');
  });

  it('sends back a date the brief does not name', () => {
    const termine = {
      type: 'termine',
      eintraege: [
        { datum: 'Mo 12.5.', titel: 'Radtour' },
        { datum: 'Fr 23.5.', titel: 'Infostand' },
      ],
    };
    expect(errorOf([termine])).toContain('Termin "Fr 23.5."');
  });
});

describe('validateDraft — nummer', () => {
  it('does not number a slide twice', () => {
    const liste = { type: 'liste', stil: 'ziffern', items: ['Radtour', 'Baumpflanzaktion'] };
    expect(errorOf([liste], { nummer: 'gross' })).toContain('nummer oder eine liste mit ziffern');
  });
});
