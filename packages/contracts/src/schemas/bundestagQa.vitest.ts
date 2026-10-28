import { describe, expect, it } from 'vitest';

import {
  bundestagAnswerResponseSchema,
  bundestagBeratungsstandSchema,
  bundestagFilterSchema,
  bundestagPlanRequestSchema,
  bundestagRefSchema,
  bundestagVerlaufLines,
} from './bundestagQa.js';

describe('bundestagRefSchema', () => {
  it.each(['20/1234', '21/1', '9/123456', 'PlPr 21/45 S. 12-15'])('akzeptiert %s', (ref) => {
    expect(bundestagRefSchema.safeParse(ref).success).toBe(true);
  });
  it.each(['123', '20/', '20/1234567', '210/1', 'PlPr 21/45 S. 12', 'plpr 21/45 S. 1-2', ''])(
    'lehnt %j ab',
    (ref) => {
      expect(bundestagRefSchema.safeParse(ref).success).toBe(false);
    }
  );
});

describe('bundestagFilterSchema', () => {
  it('akzeptiert einen leeren Filter', () => {
    expect(bundestagFilterSchema.safeParse({}).success).toBe(true);
  });
  it('lehnt einen unbekannten Drucksachetyp ab', () => {
    expect(bundestagFilterSchema.safeParse({ drucksachetyp: ['Flugblatt'] }).success).toBe(false);
  });
  it('akzeptiert bekannte Typ und Urheber', () => {
    const r = bundestagFilterSchema.safeParse({
      drucksachetyp: ['Antrag'],
      urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN'],
      wahlperiode: [21],
      datumVon: '2025-01-31',
    });
    expect(r.success).toBe(true);
  });
  it('prüft Datum, Wahlperiode und Mengenlimits', () => {
    expect(bundestagFilterSchema.safeParse({ datumVon: '31.01.2025' }).success).toBe(false);
    expect(bundestagFilterSchema.safeParse({ wahlperiode: [0] }).success).toBe(false);
    expect(bundestagFilterSchema.safeParse({ wahlperiode: [1, 2, 3, 4] }).success).toBe(false);
    expect(
      bundestagFilterSchema.safeParse({ dokumentnummer: Array(11).fill('20/1') }).success
    ).toBe(false);
    expect(bundestagFilterSchema.safeParse({ deskriptor: ['a'] }).success).toBe(false);
    expect(bundestagFilterSchema.safeParse({ deskriptor: ['Klima', 'Energie'] }).success).toBe(
      true
    );
    expect(bundestagFilterSchema.safeParse({ titel: 'x'.repeat(201) }).success).toBe(false);
  });

  it('begrenzt Typ und Urheber auf je 4', () => {
    const typ = ['Antrag', 'Gesetzentwurf', 'Kleine Anfrage', 'Antwort', 'Bericht'];
    expect(bundestagFilterSchema.safeParse({ drucksachetyp: typ }).success).toBe(false);
    const urheber = Array(5).fill('Fraktion der SPD');
    expect(bundestagFilterSchema.safeParse({ urheber }).success).toBe(false);
    expect(
      bundestagFilterSchema.safeParse({
        drucksachetyp: typ.slice(0, 4),
        urheber: urheber.slice(0, 4),
      }).success
    ).toBe(true);
  });
});

describe('Anfrage- und Antwortschemas', () => {
  it('Plan-Anfrage verlangt 3 bis 1000 Zeichen', () => {
    expect(bundestagPlanRequestSchema.safeParse({ question: 'ab' }).success).toBe(false);
    expect(bundestagPlanRequestSchema.safeParse({ question: 'Was ist mit Gas?' }).success).toBe(
      true
    );
  });
  it('Antwort nimmt Quellen mit Zitat und Status', () => {
    const r = bundestagAnswerResponseSchema.safeParse({
      answer: 'x [1]',
      citations: [
        {
          n: 1,
          ref: '21/100',
          drucksachetyp: 'Antrag',
          datum: '2025-06-01',
          titel: 'T',
          pdfUrl: null,
          aussage: 'a',
          zitat: 'z',
        },
      ],
      documents: [
        {
          ref: '21/100',
          drucksachetyp: 'Antrag',
          titel: 'T',
          textSource: 'pdf',
          relevant: true,
          points: [{ aussage: 'a', zitat: 'z', method: 'exact' }],
          droppedPoints: 0,
          windowsRead: 1,
          windowsTotal: 1,
          skipped: null,
        },
      ],
      filters: {},
      notes: [],
      stats: {
        msTotal: 1,
        msRead: 1,
        charsRead: 1,
        pointsVerified: 1,
        pointsDropped: 0,
        invalidCitations: 0,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('beratungsstand', () => {
  it('akzeptiert exakte DIP-Werte und lehnt andere ab', () => {
    expect(
      bundestagFilterSchema.safeParse({ beratungsstand: ['Verkündet', 'Abgelehnt'] }).success
    ).toBe(true);
    expect(bundestagFilterSchema.safeParse({ beratungsstand: ['Verabschiedung'] }).success).toBe(
      false
    );
    expect(bundestagBeratungsstandSchema.options).toContain(
      'In der Beratung (Einzelheiten siehe Vorgangsablauf)'
    );
  });
});

describe('bundestagVerlaufLines', () => {
  it('schreibt je Schritt eine Zeile mit Fundstelle und Seite, plus Verkündung', () => {
    expect(
      bundestagVerlaufLines({
        schritte: [
          {
            position: '2. Beratung',
            gremium: 'BT',
            datum: '2026-03-05',
            fundstelle: 'Plenarprotokoll 21/62',
            anfangsseite: 7517,
            pdfUrl: null,
            beschluesse: [
              { tenor: 'Annahme in Ausschussfassung', seite: '7524B', abstimmung: null },
              { tenor: 'Annahme einer Entschließung', seite: '7524C', abstimmung: null },
            ],
          },
          {
            position: '3. Beratung',
            gremium: 'BT',
            datum: '2026-03-05',
            fundstelle: 'Plenarprotokoll 21/62',
            anfangsseite: 7524,
            pdfUrl: null,
            beschluesse: [
              {
                tenor: 'Annahme in Ausschussfassung',
                seite: '7524B',
                abstimmung: 'Namentliche Abstimmung',
              },
            ],
          },
          {
            position: 'Beschlussempfehlung und Bericht',
            gremium: 'BT',
            datum: '2026-02-26',
            fundstelle: 'Drucksache 21/4371',
            anfangsseite: null,
            pdfUrl: null,
            beschluesse: [],
          },
        ],
        verkuendung: { datum: '2026-04-01', fundstelle: 'BGBl I 2026, 87', pdfUrl: null },
      })
    ).toEqual([
      '2. Beratung (Bundestag) 05.03.2026: Annahme in Ausschussfassung (S. 7524B); Annahme einer Entschließung (S. 7524C) — Plenarprotokoll 21/62',
      '3. Beratung (Bundestag) 05.03.2026: Annahme in Ausschussfassung (Namentliche Abstimmung) — Plenarprotokoll 21/62 S. 7524B',
      'Beschlussempfehlung und Bericht (Bundestag) 26.02.2026 — Drucksache 21/4371',
      'Verkündet 01.04.2026: BGBl I 2026, 87',
    ]);
  });
});
