import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Zusammenführungsregeln von `retrieveBundestag`: Person hängt die alten
 * Ergebnisse hinten an, Dokument/Thema nur die Kandidaten, keine Kandidaten
 * oder ein Wurf der Planstufe fallen auf die alten Ergebnisse zurück.
 */
const btSearch = vi.fn<(q: string) => Promise<unknown>>();
const plan = vi.fn<(a: unknown) => Promise<unknown>>();
vi.mock('../../../../services/bundestag/BundestagEnrichedService.js', () => ({
  getBundestagEnrichedService: () => ({ search: (q: string) => btSearch(q) }),
}));
vi.mock('../../../../services/bundestag/qa/index.js', () => ({
  planBundestagQuestion: (a: unknown): Promise<unknown> => plan(a),
}));

const { retrieveBundestag } = await import('./searchNode.js');

const candidate = (over: Record<string, unknown>) => ({
  ref: '21/1928',
  dipId: '1',
  kind: 'drucksache',
  dokumentnummer: '21/1928',
  drucksachetyp: 'Gesetzentwurf',
  titel: 'Titel',
  datum: '2025-10-01',
  urheber: ['Bundesregierung'],
  pdfUrl: 'https://dserver.bundestag.de/x.pdf',
  vorgangId: null,
  vorgangTitel: 'Vorgang',
  abstract: 'Kurz',
  aktualisiert: null,
  beratung: null,
  ...over,
});
const planWith = (candidates: unknown[]) => ({
  filters: {},
  keywords: [],
  notes: [],
  totals: { vorgaenge: 1, drucksachen: 2 },
  candidates,
});
const PERSON = {
  notes: [],
  kind: 'person',
  person: { person: { name: 'Anna Beispiel', fraktion: 'SPD' }, aktivitaeten: [], speeches: [] },
};
const DOKUMENT = {
  notes: [],
  kind: 'document',
  document: {
    drucksache: {
      dokumentnummer: '21/9',
      titel: 'Alt',
      datum: '2026-01-01',
      drucksachetyp: 'Antrag',
      urheber: [],
      pdfUrl: null,
    },
    siblings: [],
    vorgang: null,
  },
};

describe('retrieveBundestag: Zusammenführung', () => {
  beforeEach(() => {
    btSearch.mockReset();
    plan.mockReset();
  });

  it('Kandidaten werden Treffer mit Titel, Inhalt und Ref', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    plan.mockResolvedValue(
      planWith([
        candidate({}),
        candidate({ ref: 'PlPr 21/80 S. 3-9', datum: '2026-05-21', pdfUrl: null }),
      ])
    );
    const { results, totals } = await retrieveBundestag('x', 'de-DE', { wahlperiode: [21] });
    expect(plan).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'x', filters: { wahlperiode: [21] } })
    );
    expect(results.map((r) => r.title)).toEqual([
      'BT-Drs. 21/1928 · Gesetzentwurf · 01.10.2025 · Bundesregierung',
      'Plenardebatte PlPr 21/80 · 21.05.2026',
    ]);
    expect(results[0].content).toBe('Titel\nRef: 21/1928\nVorgang\nKurz');
    expect(results[0].url).toBe('https://dserver.bundestag.de/x.pdf');
    expect(results[1].relevance).toBeCloseTo(0.98);
    expect(totals).toEqual({ vorgaenge: 1, drucksachen: 2 });
  });

  it('Person: alte Ergebnisse hinter den Kandidaten', async () => {
    btSearch.mockResolvedValue(PERSON);
    plan.mockResolvedValue(planWith([candidate({})]));
    const { results } = await retrieveBundestag('Anna', 'de-DE');
    expect(results).toHaveLength(2);
    expect(results[0].title).toContain('BT-Drs.');
    expect(results[1].title).toBe('Anna Beispiel (SPD)');
  });

  it('Dokument: nur die Kandidaten', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    plan.mockResolvedValue(planWith([candidate({})]));
    const { results } = await retrieveBundestag('x', 'de-DE');
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain('21/1928');
  });

  it('leer: alte Ergebnisse', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    plan.mockResolvedValue(planWith([]));
    const { results } = await retrieveBundestag('x', 'de-DE');
    expect(results[0].title).toBe('Drucksache 21/9 · Antrag');
  });

  it('leer trotz Zeitraum-Filter: kein Rückfall auf die filterlose alte Suche', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    plan.mockResolvedValue({
      ...planWith([]),
      filters: { datumVon: '2026-10-22', datumBis: '2026-10-29' },
    });
    const { results, leerDurchFilter, ausfall } = await retrieveBundestag('letzte Woche', 'de-DE');
    expect(results).toEqual([]);
    expect(leerDurchFilter).toBe(true);
    expect(ausfall).toBeUndefined();
  });

  it('beide Stufen werfen: Ausfall, nicht leer', async () => {
    btSearch.mockRejectedValue(new Error('down'));
    plan.mockRejectedValue(new Error('down'));
    const r = await retrieveBundestag('x', 'de-DE');
    expect(r.ausfall).toBe(true);
    expect(r.results).toEqual([]);
  });

  it('Rede-Treffer der Person tragen den fertigen Aufruf für den Wortlaut', async () => {
    btSearch.mockResolvedValue({
      notes: [],
      kind: 'person',
      person: {
        person: { name: 'Katrin Uhlig', fraktion: 'GRÜNE' },
        aktivitaeten: [],
        speeches: [
          {
            speaker: 'Katrin Uhlig',
            party: 'GRÜNE',
            date: '2026-09-24',
            excerpt: 'Kurzer Auszug',
            protokollNummer: '21/96',
            wahlperiode: 21,
            herausgeber: 'BT',
            topTitle: 'Wärmeplanung',
            score: 0.8,
          },
          {
            speaker: 'Katrin Uhlig',
            party: 'GRÜNE',
            date: null,
            excerpt: 'Ohne Datum',
            protokollNummer: null,
            wahlperiode: 21,
            herausgeber: null,
            topTitle: null,
            score: 0.7,
          },
        ],
      },
    });
    plan.mockResolvedValue(planWith([]));
    const { results } = await retrieveBundestag('Katrin Uhlig', 'de-DE');
    const reden = results.filter((r) => r.title.startsWith('Rede:'));
    expect(reden[0].content).toContain(
      'Wortlaut: bundestag_reden mit thema "Wärmeplanung", redner "Katrin Uhlig", datumVon "2026-09-24", datumBis "2026-09-24"'
    );
    expect(reden[1].content).toContain(
      'Wortlaut: bundestag_reden mit thema "Katrin Uhlig", redner "Katrin Uhlig"'
    );
    expect(reden[1].content).not.toContain('datumVon');
  });

  it('Wurf der Planstufe: alte Ergebnisse', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    plan.mockRejectedValue(new Error('boom'));
    const { results, totals } = await retrieveBundestag('x', 'de-DE');
    expect(results[0].title).toBe('Drucksache 21/9 · Antrag');
    expect(totals).toBeNull();
  });

  it('Wurf der Anreicherung: Kandidaten bleiben', async () => {
    btSearch.mockRejectedValue(new Error('enriched down'));
    plan.mockResolvedValue(planWith([candidate({})]));
    const { results, totals } = await retrieveBundestag('x', 'de-DE');
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain('21/1928');
    expect(totals).toEqual({ vorgaenge: 1, drucksachen: 2 });
  });

  it('de-AT: Absage, keiner der Dienste wird gefragt', async () => {
    const { results } = await retrieveBundestag('x', 'de-AT');
    expect(results[0].title).toBe('Nur für Deutschland verfügbar');
    expect(btSearch).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });

  it('hängt den Beratungsverlauf an den ersten Treffer je Vorgang und gibt ihn der Karte', async () => {
    btSearch.mockResolvedValue(DOKUMENT);
    const verlauf = {
      schritte: [
        {
          position: '3. Beratung',
          gremium: 'BT',
          datum: '2026-03-05',
          fundstelle: 'Plenarprotokoll 21/62',
          anfangsseite: 7524,
          pdfUrl: null,
          beschluesse: [{ tenor: 'Annahme in Ausschussfassung', seite: '7524B', abstimmung: null }],
        },
      ],
      verkuendung: null,
    };
    plan.mockResolvedValue(
      planWith([
        candidate({ vorgangId: 'v1', verlauf }),
        candidate({ ref: '21/2000', vorgangId: 'v1', verlauf }),
      ])
    );
    const { results, verfahren } = await retrieveBundestag('x', 'de-DE');
    const zeile =
      '• 3. Beratung (Bundestag) 05.03.2026: Annahme in Ausschussfassung — Plenarprotokoll 21/62 S. 7524B';
    expect(results[0]?.content).toContain(zeile);
    // Die Ref steht vor dem Verlauf: kappt die Schnipselgrenze, bleibt der Schlüssel.
    expect(results[0]?.content.indexOf('Ref: 21/1928')).toBeLessThan(
      results[0]?.content.indexOf(zeile) ?? 0
    );
    expect(results[1]?.content).not.toContain('Beratungsverlauf');
    expect(verfahren).toEqual([{ titel: 'Vorgang', zeilen: [zeile.slice(2)] }]);
  });
});
