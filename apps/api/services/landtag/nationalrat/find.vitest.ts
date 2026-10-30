import { describe, expect, it, vi } from 'vitest';

import { gegenstandToCandidate, gpNumber, gpRoman, protokollToCandidate } from './documents.js';
import { type NationalratApi, type NrRow, rowsOf } from './filterApi.js';
import { findNationalrat } from './find.js';
import { resolveNationalratRefs } from './refs.js';

/** Eine Zeile der Liste 101, wie die Filter-API sie liefert (Arrays als JSON-String). */
const row = (over: Partial<Record<string, unknown>>): NrRow => ({
  GP_CODE: 'XXVIII',
  ITYP: 'A',
  INR: '647',
  Nummer: '647/A(E)',
  DOKTYP: 'A(E)',
  DOKTYP_LANG: 'Selbständiger Entschließungsantrag',
  Betreff: 'effektives Anti-Mietwuchergesetz zur Bekämpfung überhöhter Mietpreise (GRÜNE)',
  DATUMSORT: '20251211',
  HIS_URL: '/gegenstand/XXVIII/A/647',
  Fraktionen: '["GRÜNE"]',
  THEMEN: '["Wohnen"]',
  SW: '["Mietrecht"]',
  EUROVOC: '[]',
  NRBR: 'NR',
  ...over,
});

const ROWS: NrRow[] = [
  row({}),
  row({
    ITYP: 'I',
    INR: '26',
    Nummer: '26 d.B.',
    DOKTYP: 'RV',
    DOKTYP_LANG: 'Regierungsvorlage: Bundes(verfassungs)gesetz',
    Betreff: 'Klimaschutzgesetz',
    DATUMSORT: '20260313',
    HIS_URL: '/gegenstand/XXVIII/I/26',
    Fraktionen: '[""]',
    THEMEN: '["Umwelt"]',
    SW: '[]',
  }),
  row({
    INR: '98',
    Nummer: '98/A(E)',
    Betreff: 'Sofortige Ausweitung der Mietpreisbremse auf freie Mieten! (NEOS)',
    DATUMSORT: '20250307',
    HIS_URL: '/gegenstand/XXVIII/A/98',
    Fraktionen: '["NEOS"]',
  }),
];

const PROTOKOLLE: NrRow[] = [
  {
    uri: '/gegenstand/XXVIII/NRSITZ/41',
    inr: 41,
    datum2: '2025-09-24T00:00:00',
    Gesamtprotokoll: '<a href="/dokument/XXVIII/NRSITZ/41/fnameorig_1.html">HTML</a>',
  },
  {
    uri: '/gegenstand/XXVIII/NRSITZ/60',
    inr: 60,
    datum2: '2025-12-12T00:00:00',
    Gesamtprotokoll: '<div></div>',
  },
];

const fakeApi = (): NationalratApi & { gegenstaende: ReturnType<typeof vi.fn> } => ({
  gegenstaende: vi.fn(async () => ROWS),
  protokolle: vi.fn(async () => PROTOKOLLE),
  dokumente: vi.fn(async () => []),
  reden: vi.fn(async () => []),
});

describe('Gesetzgebungsperiode', () => {
  it('rechnet zwischen arabisch und römisch', () => {
    expect(gpRoman(28)).toBe('XXVIII');
    expect(gpRoman(27)).toBe('XXVII');
    expect(gpRoman(24)).toBe('XXIV');
    expect(gpNumber('XXVIII')).toBe(28);
    expect(gpNumber('XXIV')).toBe(24);
    expect(gpNumber('XIX')).toBe(19);
  });
});

describe('Lizenzgrenze (#5114)', () => {
  it('macht aus Schriftlichen Anfragen, Beantwortungen und Mündlichen Anfragen keinen Kandidaten', () => {
    for (const ITYP of ['J', 'AB', 'M']) {
      expect(gegenstandToCandidate(row({ ITYP }))).toBeNull();
    }
    expect(gegenstandToCandidate(row({}))?.ref).toBe('NR 28/A647');
  });

  it('löst Anfrage-Refs nie auf, auch wenn die Liste sie enthielte', async () => {
    const api = fakeApi();
    api.gegenstaende.mockResolvedValue([row({ ITYP: 'J', INR: '1000' })]);
    expect(await resolveNationalratRefs(['NR 28/J1000'], api)).toEqual([]);
  });
});

describe('rowsOf', () => {
  it('liest positionale Zeilen über die Spaltennamen; doppelte Spalten behalten den ersten Wert', () => {
    expect(
      rowsOf({
        header: [{ label: 'Art' }, { label: 'inr' }, { label: 'Art' }],
        rows: [['A', 1, 'B']],
      })
    ).toEqual([{ Art: 'A', inr: 1 }]);
  });
});

describe('findNationalrat', () => {
  it('findet Themenwörter in Betreff und Schlagworten, auch mit anderer Endung', async () => {
    const r = await findNationalrat({ query: 'Mietpreisbremsen', filters: {} }, fakeApi());
    expect(r.candidates.map((c) => c.ref)).toEqual(['NR 28/A98']);
    const sw = await findNationalrat({ query: 'Mietrecht', filters: {} }, fakeApi());
    expect(sw.candidates.map((c) => c.ref)).toEqual(['NR 28/A647', 'NR 28/A98']);
  });

  it('filtert Klub, Art und Zeitraum lokal und nennt, was ein Klubfilter auslässt', async () => {
    const klub = await findNationalrat({ query: '', filters: { fraktion: ['gruene'] } }, fakeApi());
    expect(klub.candidates.map((c) => c.ref)).toEqual(['NR 28/A647']);
    expect(klub.notes).toEqual([expect.stringMatching(/Regierungsvorlagen.*keine Fraktion/)]);

    const rv = await findNationalrat({ query: '', filters: { typ: ['Gesetzentwurf'] } }, fakeApi());
    expect(rv.candidates.map((c) => c.drucksachetyp)).toEqual([
      'Regierungsvorlage: Bundes(verfassungs)gesetz',
    ]);

    const zeit = await findNationalrat(
      { query: '', filters: { datumVon: '2025-12-01', datumBis: '2025-12-31' } },
      fakeApi()
    );
    expect(zeit.candidates.map((c) => c.ref)).toEqual(['NR 28/A647']);
  });

  it('fragt die angegebene Gesetzgebungsperiode, sonst die laufende, und sagt es bei älterem Zeitraum', async () => {
    const api = fakeApi();
    await findNationalrat({ query: 'Miete', filters: { wahlperiode: 27 } }, api);
    expect(api.gegenstaende).toHaveBeenLastCalledWith('XXVII');
    const alt = await findNationalrat({ query: 'Miete', filters: { datumVon: '2023-01-01' } }, api);
    expect(api.gegenstaende).toHaveBeenLastCalledWith('XXVIII');
    expect(alt.notes).toEqual(expect.arrayContaining([expect.stringMatching(/wahlperiode/)]));
  });

  it('listet Protokolle nach Datum und sagt, dass das Thema dort nicht geprüft ist', async () => {
    const api = fakeApi();
    const r = await findNationalrat(
      { query: 'Klimaschutz', filters: { typ: ['Plenarprotokoll'] } },
      api
    );
    expect(api.gegenstaende).not.toHaveBeenCalled();
    expect(r.candidates.map((c) => c.ref)).toEqual(['NR 28/NRSITZ60', 'NR 28/NRSITZ41']);
    expect(r.notes).toEqual([expect.stringMatching(/nur nach Datum/)]);
  });

  it('sucht keine Anfragen und sagt warum', async () => {
    const api = fakeApi();
    const r = await findNationalrat({ query: 'Schule', filters: { typ: ['Anfrage'] } }, api);
    expect(r.candidates).toEqual([]);
    expect(r.ausgeschlossen).toMatch(/CC-BY-Lizenz/);
    expect(api.gegenstaende).not.toHaveBeenCalled();
  });
});

describe('resolveNationalratRefs', () => {
  it('löst Gegenstände und Sitzungen aus den Listen auf und lässt Unbekanntes weg', async () => {
    const out = await resolveNationalratRefs(
      ['NR 28/I26', 'NR 28/NRSITZ41', 'NR 28/A999', 'NR 28/I26'],
      fakeApi()
    );
    expect(out.map((c) => c.ref)).toEqual(['NR 28/I26', 'NR 28/NRSITZ41']);
    expect(out[1]).toMatchObject(
      protokollToCandidate(PROTOKOLLE[0]!, 28) as unknown as Record<string, unknown>
    );
  });
});
