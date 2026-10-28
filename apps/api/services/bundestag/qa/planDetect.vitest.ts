import { describe, expect, it } from 'vitest';

import {
  detectDrucksachetyp,
  detectBeratungsstand,
  detectFromWording,
  detectUrheber,
  detectZeitraum,
  drucksachetypAusTitel,
} from './planDetect.js';

describe('detectDrucksachetyp', () => {
  it.each([
    ['Welche Entschließungsanträge gab es?', ['Entschließungsantrag']],
    ['ein Entschliessungsantrag', ['Entschließungsantrag']],
    ['Änderungsanträge zum Haushalt', ['Änderungsantrag']],
    ['Kleine Anfragen zur Bahn', ['Kleine Anfrage']],
    ['die Große Anfrage', ['Große Anfrage']],
    ['Gesetzentwürfe und Gesetzesentwurf', ['Gesetzentwurf']],
    ['Beschlussempfehlungen', ['Beschlussempfehlung und Bericht']],
    ['Unterrichtung der Regierung', ['Unterrichtung']],
    ['Die Regierung hat geantwortet', ['Antwort']],
    ['Antworten auf Anfragen', ['Antwort']],
    ['Welche Anträge gab es?', ['Antrag']],
    ['Antrag und Änderungsantrag', ['Änderungsantrag', 'Antrag']],
    ['Welche Drucksachen und Dokumente?', []],
  ])('%s', (q, expected) => {
    expect(detectDrucksachetyp(q)).toEqual(expected);
  });

  it('Zusammensetzung zählt nicht als Antrag', () => {
    expect(detectDrucksachetyp('Entschließungsanträge')).not.toContain('Antrag');
  });
});

describe('detectUrheber', () => {
  it.each([
    ['von den Grünen', ['Fraktion BÜNDNIS 90/DIE GRÜNEN']],
    ['Bündnis 90', ['Fraktion BÜNDNIS 90/DIE GRÜNEN']],
    ['die grüne Fraktion', ['Fraktion BÜNDNIS 90/DIE GRÜNEN']],
    ['der Union', ['Fraktion der CDU/CSU']],
    ['CSU', ['Fraktion der CDU/CSU']],
    ['SPD', ['Fraktion der SPD']],
    ['AfD', ['Fraktion der AfD']],
    ['die Linken', ['Fraktion DIE LINKE']],
    ['FDP', ['Fraktion der FDP']],
    [
      'Antwort der Bundesregierung auf die Anfrage der Grünen',
      ['Fraktion BÜNDNIS 90/DIE GRÜNEN', 'Bundesregierung'],
    ],
    ['grünen Wasserstoff und linke Politik', []],
    ['die Europäische Union', []],
  ])('%s', (q, expected) => {
    expect(detectUrheber(q)).toEqual(expected);
  });
});

describe('detectZeitraum', () => {
  it.each([
    ['seit Januar 2026', { datumVon: '2026-01-01' }],
    ['seit März 2025', { datumVon: '2025-03-01' }],
    ['seit 2024', { datumVon: '2024-01-01' }],
    ['im Jahr 2023', { datumVon: '2023-01-01', datumBis: '2023-12-31' }],
    ['in 2023', { datumVon: '2023-01-01', datumBis: '2023-12-31' }],
    ['vor Februar 2024', { datumBis: '2024-02-29' }],
    ['bis Dezember 2025', { datumBis: '2025-12-31' }],
    ['bis 2025', { datumBis: '2025-12-31' }],
    ['seit Januar 2026 bis Juni 2026', { datumVon: '2026-01-01', datumBis: '2026-06-30' }],
    ['seit 1800', {}],
    ['ohne Datum', {}],
  ])('%s', (q, expected) => {
    expect(detectZeitraum(q)).toEqual(expected);
  });
});

describe('detectFromWording', () => {
  it('Beispielfrage aus dem Live-Test', () => {
    expect(
      detectFromWording(
        'Welche Entschließungsanträge haben die Grünen seit Januar 2026 eingebracht?'
      )
    ).toEqual({
      drucksachetyp: ['Entschließungsantrag'],
      urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN'],
      datumVon: '2026-01-01',
    });
  });
});

describe('detectFromWording: Wahlperiode', () => {
  it('„dieser Wahlperiode" ist die laufende', () => {
    expect(
      detectFromWording(
        'Wie viele Kleine Anfragen hat die grüne Bundestagsfraktion in dieser Wahlperiode gestellt?'
      ).wahlperiode
    ).toEqual([21]);
  });
  it('eine genannte Wahlperiode schlägt „diese"', () => {
    expect(detectFromWording('Anträge in der Wahlperiode 20').wahlperiode).toEqual([20]);
    expect(detectFromWording('WP 99').wahlperiode).toBeUndefined();
  });
  it('ohne Hinweis keine Wahlperiode', () => {
    expect(detectFromWording('Anträge zur Windkraft').wahlperiode).toBeUndefined();
  });
});

describe('detectBeratungsstand', () => {
  it.each([
    'Was wurde im Bundestag zu Artenschutz beschlossen?',
    'Welche Gesetze zu Wasserstoff wurden verabschiedet?',
    'Ist das Gesetz in Kraft getreten?',
    'Welche Anträge wurden angenommen?',
  ])('beschlossen: %s', (q) => {
    expect(detectBeratungsstand(q)).toEqual([
      'Verkündet',
      'Angenommen',
      'Verabschiedet',
      'Bundesrat hat zugestimmt',
    ]);
  });
  it('abgelehnt schlägt beschlossen', () => {
    expect(detectBeratungsstand('Welche Anträge wurden abgelehnt?')).toEqual(['Abgelehnt']);
    expect(detectBeratungsstand('Was ist abgelehnt und nicht beschlossen worden?')).toEqual([
      'Abgelehnt',
    ]);
  });
  it('noch in Beratung schlägt „beschlossen"', () => {
    const r = detectBeratungsstand('Was ist noch nicht beschlossen, sondern in Beratung?');
    expect(r).toContain('Überwiesen');
    expect(r).not.toContain('Verkündet');
  });
  it('nennt ohne Stand nichts', () => {
    expect(detectBeratungsstand('Welche Anfragen zum Artenschutz gibt es?')).toEqual([]);
  });
  it('landet in detectFromWording', () => {
    expect(detectFromWording('Was wurde zu Artenschutz beschlossen?').beratungsstand).toHaveLength(
      4
    );
  });
});

describe('drucksachetypAusTitel', () => {
  it.each([
    ['Kleine Anfrage', 'Kleine Anfrage'],
    ['kleine anfragen', 'Kleine Anfrage'],
    ['  Große Anfragen ', 'Große Anfrage'],
    ['Gesetzentwurf', 'Gesetzentwurf'],
    ['Anträge', 'Antrag'],
  ])('%s ist ein Drucksachetyp', (titel, typ) => {
    expect(drucksachetypAusTitel(titel)).toBe(typ);
  });

  it.each(['Kleine Anfrage zur Bahn', 'Klimaschutz', 'Antrag auf Fristverlängerung', ''])(
    '%s bleibt ein Titelfilter',
    (titel) => {
      expect(drucksachetypAusTitel(titel)).toBeNull();
    }
  );
});
