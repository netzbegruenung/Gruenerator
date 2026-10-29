import { describe, expect, it, vi } from 'vitest';

import { findBerlin } from './find.js';
import { type PardokLister, type PardokPage, type PardokParams } from './pardokLive.js';

import type { PardokRecord } from '../../scrapers/implementations/LandtagBerlinScraper/pardokClient.js';

const antrag = (nr: string, datum: string, urheber = 'Grüne'): PardokRecord => ({
  dokumentnummer: [{ main: nr }],
  drucksachentyp: [{ main: 'Antrag' }],
  id: [{ main: `D-${nr}` }],
  titel: [{ main: '', t: `Antrag ${nr}`, d: 'Verkehr' }],
  urheber_koerperschaft: [{ main: urheber }],
  wahlperiode: [{ main: '19' }],
  datum,
  pdf_url: [
    {
      main: `https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/DruckSachen/d19-${nr}.pdf`,
    },
  ],
});

const anfrage = (nr: string, fraktion: string): PardokRecord => ({
  dokumentnummer: [{ main: nr }],
  drucksachentyp: [{ main: 'Schriftliche Anfrage' }],
  id: [{ main: `D-${nr}` }],
  titel: [{ main: '', t: `Anfrage ${nr}` }],
  urheber: [{ name: 'Muster, Max', fraktion }],
  wahlperiode: [{ main: '19' }],
  datum: '2026.10.01',
  pdf_url: [
    { main: `https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-${nr}.pdf` },
  ],
});

function lister(handler: (p: PardokParams) => PardokRecord[] | PardokPage) {
  const calls: PardokParams[] = [];
  const impl: PardokLister = {
    list: vi.fn(async (_e, params) => {
      calls.push(params);
      const out = handler(params);
      return Array.isArray(out) ? { numFound: out.length, cursor: null, documents: out } : out;
    }),
  };
  return { impl, calls };
}

describe('findBerlin', () => {
  it('fragt ODER-Listen als Einzelabfragen (f.urheber ist UND, f.drucksachtyp nimmt nur einen Wert)', async () => {
    const { impl, calls } = lister((p) =>
      p['f.urheber'] === 'Grüne'
        ? [antrag('1', '2026.03.01')]
        : [antrag('2', '2026.05.01', 'Die Linke')]
    );
    const out = await findBerlin(
      {
        query: 'Verkehrswende',
        filters: { typ: ['Antrag', 'Änderungsantrag'], fraktion: ['gruene', 'linke'] },
      },
      impl
    );
    const combos = calls.map((c) => [c['f.drucksachtyp'], c['f.urheber']].join('|'));
    expect(combos).toEqual(
      expect.arrayContaining([
        'Antrag|Grüne',
        'Antrag|Die Linke',
        'Änderungsantrag|Grüne',
        'Änderungsantrag|Die Linke',
      ])
    );
    expect(
      calls.every((c) => !Array.isArray(c['f.urheber']) && !Array.isArray(c['f.drucksachtyp']))
    ).toBe(true);
    // Neueste zuerst, Dubletten zusammengeführt.
    expect(out.candidates.map((c) => c.ref)).toEqual(['BE 19/2', 'BE 19/1']);
  });

  it('sucht Titelbegriffe als ODER und gibt Zeitraum und Wahlperiode weiter', async () => {
    const { impl, calls } = lister(() => [
      antrag('1', '2026.03.01'),
      antrag('2', '2026.04.01'),
      antrag('3', '2026.05.01'),
    ]);
    await findBerlin(
      {
        query: 'Radverkehr Verkehrswende',
        filters: { wahlperiode: 19, datumVon: '2026-01-01', datumBis: '2026-12-31' },
      },
      impl
    );
    expect(calls[0]).toMatchObject({
      'f.titel': ['radverkehr', 'verkehrswende'],
      'f.wahlperiode': 19,
      'f.datum.start': '2026-01-01',
      'f.datum.end': '2026-12-31',
    });
  });

  it('fällt bei zu wenigen Titeltreffern auf EINEN Volltext-Begriff zurück und sagt es', async () => {
    const { impl, calls } = lister((p) => ('f.volltext' in p ? [antrag('9', '2026.06.01')] : []));
    const out = await findBerlin({ query: 'Verkehrswende', filters: {} }, impl);
    expect(calls.map((c) => ('f.volltext' in c ? 'volltext' : 'titel'))).toEqual([
      'titel',
      'volltext',
    ]);
    expect(calls[1]!['f.volltext']).toBe('verkehrswende');
    expect(out.candidates).toHaveLength(1);
    expect(out.notes.join(' ')).toMatch(/Volltext/);
  });

  it('erklärt Null Treffer mit der Zahl ohne Themenwort', async () => {
    const { impl } = lister((p) => {
      if ('f.titel' in p || 'f.volltext' in p) return [];
      return { numFound: 76, cursor: null, documents: [] };
    });
    const out = await findBerlin(
      { query: 'Verkehrswende', filters: { typ: ['Antrag'], fraktion: ['gruene'] } },
      impl
    );
    expect(out.candidates).toEqual([]);
    expect(out.notes.join(' ')).toMatch(/etwa 76 Dokumente/);
  });

  it('stoppt vor der Abfrage, wenn die Fraktion dort nicht vertreten ist', async () => {
    const { impl } = lister(() => []);
    const out = await findBerlin({ query: 'Verkehr', filters: { fraktion: ['bsw'] } }, impl);
    expect(impl.list).not.toHaveBeenCalled();
    expect(out.ausgeschlossen).toMatch(/BSW.*nicht vertreten/);
  });

  it('meldet einen nicht unterstützten Filter und sucht ohne ihn', async () => {
    const { impl, calls } = lister(() => [antrag('1', '2026.03.01')]);
    const out = await findBerlin({ query: 'Verkehr', filters: { schlagwort: 'Radweg' } }, impl);
    expect(out.notes.join(' ')).toMatch(/Schlagwortfilter/);
    expect(JSON.stringify(calls)).not.toMatch(/Radweg/);
  });

  it('filtert Schriftliche Anfragen nach der Fraktion der fragenden Person lokal und nennt die Grenze', async () => {
    const { impl, calls } = lister(() => ({
      numFound: 500,
      cursor: null,
      documents: [anfrage('27001', 'SPD'), anfrage('27002', 'Grüne'), anfrage('27003', 'Grüne')],
    }));
    const out = await findBerlin(
      { query: '', filters: { typ: ['Anfrage'], fraktion: ['gruene'] } },
      impl
    );
    expect(out.candidates.map((c) => c.ref).sort()).toEqual(['BE 19/S27002', 'BE 19/S27003']);
    expect(calls.every((c) => !('f.urheber' in c))).toBe(true);
    expect(out.notes.join(' ')).toMatch(/Geprüft wurden die neuesten 3 von 500/);
  });

  it('weist bei Fraktionsfilter ohne Art darauf hin, dass Anfragen fehlen', async () => {
    const { impl } = lister(() => [antrag('1', '2026.03.01')]);
    const out = await findBerlin({ query: 'Verkehr', filters: { fraktion: ['gruene'] } }, impl);
    expect(out.notes.join(' ')).toMatch(/Schriftliche Anfragen einzelner Abgeordneter/);
  });

  it('verlangt Suchbegriff oder Filter', async () => {
    const { impl } = lister(() => []);
    const out = await findBerlin({ query: '', filters: {} }, impl);
    expect(out.notes[0]).toMatch(/fehlt/);
    expect(impl.list).not.toHaveBeenCalled();
  });
});
