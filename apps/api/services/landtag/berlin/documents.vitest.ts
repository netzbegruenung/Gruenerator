import { describe, expect, it } from 'vitest';

import { dedupeByRef, isAnfrageRecord, personFraktion, toCandidate } from './documents.js';

import type { PardokRecord } from '../../scrapers/implementations/LandtagBerlinScraper/pardokClient.js';

const antrag: PardokRecord = {
  dokumentnummer: [{ main: '3519' }],
  drucksachentyp: [{ main: 'Antrag' }],
  id: [{ main: 'D-458706' }],
  titel: [
    {
      main: '',
      t: 'Nach dem größten Cyberangriff auf Berlin: Transparenz schaffen',
      d: 'IT-Kriminalität',
    },
  ],
  urheber_koerperschaft: [
    { main: 'Grüne', Y: '2294' },
    { main: 'Die Linke', Y: '6438' },
  ],
  wahlperiode: [{ main: '19' }],
  datum: '2026.09.09',
  aktualisiert: [{ D: '2026 09 10', T: '08:27:45' }],
  vorgangsbezug: [{ main: 'V-458705', p: '0000' }],
  pdf_url: [
    {
      main: 'https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/DruckSachen/d19-3519.pdf',
    },
  ],
};

const anfrage: PardokRecord = {
  dokumentnummer: [{ main: '27288' }],
  drucksachentyp: [{ main: 'Schriftliche Anfrage' }],
  id: [{ main: 'D-460271' }],
  titel: [{ main: '', t: 'DiVerso in Treptow-Köpenick', d: 'Informationssystem' }],
  urheber: [{ name: 'Freier-Winterwerb, Alexander', fraktion: 'SPD' }],
  wahlperiode: [{ main: '19' }],
  datum: '2026.10.12',
  pdf_url: [
    { main: 'https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-27288.pdf' },
  ],
};

const antwort: PardokRecord = {
  ...anfrage,
  id: [{ main: 'D-460272' }],
  drucksachentyp: [{ main: 'Antwort' }],
  datum: '2026.10.14',
  urheber: [],
  urheber_koerperschaft: [{ main: 'Senatsverwaltung für Wissenschaft, Gesundheit und Pflege' }],
};

describe('toCandidate', () => {
  it('baut den Ref einer Drucksache und die Anzeigefelder', () => {
    expect(toCandidate(antrag)).toMatchObject({
      ref: 'BE 19/3519',
      dokumentnummer: '19/3519',
      drucksachetyp: 'Antrag',
      datum: '2026-09-09',
      urheber: ['Grüne', 'Die Linke'],
      abstract: 'IT-Kriminalität',
      vorgangId: 'V-458705',
      kind: 'drucksache',
      beratung: null,
    });
  });

  it('gibt Schriftlichen Anfragen die eigene S-Reihe und die fragende Person als Urheber', () => {
    expect(toCandidate(anfrage)).toMatchObject({
      ref: 'BE 19/S27288',
      urheber: ['Freier-Winterwerb, Alexander (SPD)'],
    });
  });

  it('entfernt führende Nullen alter Drucksachennummern', () => {
    const alt = { ...antrag, dokumentnummer: [{ main: '0964' }], wahlperiode: [{ main: '18' }] };
    expect(toCandidate(alt)?.ref).toBe('BE 18/964');
  });

  it('verwirft Datensätze ohne Id, Nummer oder Wahlperiode', () => {
    expect(toCandidate({ ...antrag, wahlperiode: [] })).toBeNull();
  });
});

describe('Anfrage und Antwort', () => {
  it('teilen Ref und PDF; pro Ref bleibt die Anfrage', () => {
    const a = toCandidate(antwort)!;
    const q = toCandidate(anfrage)!;
    expect(a.ref).toBe(q.ref);
    expect(dedupeByRef([a, q])).toEqual([q]);
    expect(dedupeByRef([q, a])).toEqual([q]);
  });

  it('erkennt die Anfrage-Reihe am Pfad, auch in alten Wahlperioden', () => {
    expect(isAnfrageRecord('https://x/VT/15/KlAnfr/ka15-12601.pdf', 'Antwort')).toBe(true);
    expect(isAnfrageRecord('https://x/VT/19/DruckSachen/d19-1.pdf', 'Antwort')).toBe(false);
  });

  it('liest die Fraktion der fragenden Person', () => {
    expect(personFraktion(anfrage)).toEqual(['SPD']);
    expect(personFraktion(antrag)).toEqual([]);
  });
});
