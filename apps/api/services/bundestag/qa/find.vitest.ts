import { describe, expect, it, vi } from 'vitest';

import { type BundestagFilter } from '@gruenerator/contracts';

import { type FindDip, findCandidates } from './find.js';

const budget = { maxDocuments: 12, maxReadChars: 1, deadlineMs: 1 };

type Call = { endpoint: string; params: Record<string, unknown> };

function makeDip(handler: (endpoint: string, params: Record<string, unknown>) => unknown[]) {
  const calls: Call[] = [];
  return {
    calls,
    list: vi.fn(async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ endpoint, params });
      const documents = handler(endpoint, params);
      return { numFound: documents.length, cursor: null, documents };
    }) as unknown as FindDip['list'],
  };
}

const mcpNone = { semanticSearch: vi.fn(async () => ({ items: [] })) };

const vorgang = { id: '335070', titel: 'Heizungsgesetz', initiative: ['Fraktion der SPD'] };
const positions = [
  {
    vorgangsposition: 'Antrag',
    datum: '2025-01-01',
    fundstelle: {
      id: '287962',
      dokumentnummer: '21/6019',
      drucksachetyp: 'Antrag',
      pdf_url: 'https://dserver.bundestag.de/btd/21/060/2106019.pdf',
    },
  },
  {
    vorgangsposition: '1. Beratung',
    datum: '2025-02-01',
    fundstelle: {
      id: 'p80',
      dokumentnummer: '21/80',
      drucksachetyp: 'Plenarprotokoll',
      pdf_url: 'https://dserver.bundestag.de/btp/21/21080.pdf',
      xml_url: 'https://dserver.bundestag.de/btp/21/21080.xml',
      anfangsseite: 9553,
      endseite: 9572,
    },
  },
  {
    vorgangsposition: 'Beschlussempfehlung',
    datum: '2025-03-01',
    fundstelle: {
      id: '300001',
      dokumentnummer: '21/7009',
      drucksachetyp: 'Beschlussempfehlung und Bericht',
      pdf_url: null,
    },
  },
];

const vorgangDip = () =>
  makeDip((e) => (e === 'vorgang' ? [vorgang] : e === 'vorgangsposition' ? positions : []));

describe('findCandidates', () => {
  it('klappt Vorgang → Positionen → Kandidaten samt Beratungs-Ref aus', async () => {
    const dip = vorgangDip();
    const r = await findCandidates({
      question: 'Heizung',
      filters: { deskriptor: ['Heizung'], mitBeratung: true },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(r.candidates.map((c) => c.ref)).toEqual([
      '21/6019',
      'PlPr 21/80 S. 9553-9572',
      '21/7009',
    ]);
    const b = r.candidates[1];
    expect(b).toMatchObject({
      kind: 'beratung',
      drucksachetyp: 'Plenarprotokoll',
      dokumentnummer: '21/80',
      beratung: {
        xmlUrl: 'https://dserver.bundestag.de/btp/21/21080.xml',
        anfangsseite: 9553,
        endseite: 9572,
      },
    });
    expect(b.titel).toBe('1. Beratung – Heizungsgesetz');
    expect(dip.calls[0].params['f.zuordnung']).toBe('BT');
    expect(dip.calls[1].params['f.vorgang']).toBe('335070');
  });

  it('lässt Beratungen ohne mitBeratung weg und filtert nach Typ', async () => {
    const r = await findCandidates({
      question: 'Heizung',
      filters: { deskriptor: ['Heizung'], drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip: vorgangDip(),
      mcp: mcpNone,
    });
    expect(r.candidates.map((c) => c.ref)).toEqual(['21/6019']);
  });

  it('fragt mehrere Typen und Urheber als ODER ab — je Kombination eine Abfrage', async () => {
    // DIP verknüpft wiederholte f.drucksachetyp/f.urheber mit UND (live: 806 + 2903 → 0).
    let n = 0;
    const dip = makeDip((e, p) =>
      e === 'drucksache'
        ? [
            {
              id: `${String(p['f.drucksachetyp'])}|${String(p['f.urheber'])}`,
              dokumentnummer: `21/${++n}`,
            },
          ]
        : []
    );
    const r = await findCandidates({
      question: 'x',
      filters: {
        drucksachetyp: ['Antrag', 'Kleine Anfrage'],
        urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN', 'Fraktion DIE LINKE'],
      },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    const calls = dip.calls.filter((c) => c.endpoint === 'drucksache');
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(typeof c.params['f.drucksachetyp']).toBe('string');
      expect(typeof c.params['f.urheber']).toBe('string');
    }
    expect(r.candidates).toHaveLength(4);
  });

  it('nennt in einer Notiz, welche Kombinationen über das ODER-Limit hinaus nicht abgefragt wurden', async () => {
    const dip = makeDip((e) => (e === 'drucksache' ? [{ id: 'x', dokumentnummer: '21/1' }] : []));
    const r = await findCandidates({
      question: 'x',
      // Direkt am Schema vorbei (Wortlauterkennung): 3 × 3 = 9 Kombinationen, 8 Abfragen.
      filters: {
        drucksachetyp: ['Antrag', 'Gesetzentwurf', 'Kleine Anfrage'],
        urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN', 'Fraktion DIE LINKE', 'Fraktion der SPD'],
      },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(dip.calls.filter((c) => c.endpoint === 'drucksache')).toHaveLength(8);
    const note = r.notes.find((n) => n.includes('nicht abgefragt'));
    expect(note).toContain('Kleine Anfrage');
    expect(note).toContain('Fraktion der SPD');
  });

  it('entfernt Duplikate nach dipId und kappt auf maxDocuments', async () => {
    const dip = makeDip((e) =>
      e === 'drucksache'
        ? [
            { id: 'a', dokumentnummer: '21/1' },
            { id: 'a', dokumentnummer: '21/1' },
            { id: 'b', dokumentnummer: '21/2' },
            { id: 'c', dokumentnummer: '21/3' },
          ]
        : []
    );
    const r = await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget: { ...budget, maxDocuments: 3 },
      dip,
      mcp: mcpNone,
    });
    expect(r.candidates.map((c) => c.dipId)).toEqual(['a', 'b', 'c']);
    expect(dip.calls[0].params['f.drucksachetyp']).toBe('Antrag');
  });

  it('sendet nie leere Arrays', async () => {
    const dip = makeDip(() => []);
    await findCandidates({
      question: 'x',
      filters: { titel: 'Haushalt', deskriptor: [], urheber: [] },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(Object.keys(dip.calls[0].params)).not.toContain('f.deskriptor');
    expect(Object.keys(dip.calls[0].params)).not.toContain('f.initiative');
  });

  it('holt bei einer Nummer die Geschwister über vorgangsposition', async () => {
    const dip = makeDip((e) =>
      e === 'drucksache'
        ? [
            {
              id: '287962',
              dokumentnummer: '21/6019',
              drucksachetyp: 'Antrag',
              vorgangsbezug: [{ id: '335070', titel: 'Heizungsgesetz' }],
            },
          ]
        : e === 'vorgangsposition'
          ? positions
          : []
    );
    const r = await findCandidates({
      question: 'x',
      filters: { dokumentnummer: ['21/6019'] },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(r.candidates.map((c) => c.ref)).toEqual(['21/6019', '21/7009']);
  });

  it('merkt an, wenn zu einer Drucksache noch keine Antwort vorliegt', async () => {
    const mk = (withAntwort: boolean) =>
      makeDip((e) =>
        e === 'drucksache'
          ? [
              {
                id: '1',
                dokumentnummer: '21/8725',
                drucksachetyp: 'Kleine Anfrage',
                vorgangsbezug: [{ id: '9', titel: 'KA' }],
              },
            ]
          : e === 'vorgangsposition'
            ? withAntwort
              ? [
                  {
                    vorgangsposition: 'Antwort',
                    datum: '2025-01-01',
                    fundstelle: { id: '2', dokumentnummer: '21/9000', drucksachetyp: 'Antwort' },
                  },
                ]
              : []
            : []
      );
    const run = (dip: ReturnType<typeof mk>) =>
      findCandidates({
        question: 'x',
        filters: { dokumentnummer: ['21/8725'], drucksachetyp: ['Antwort'] },
        assumedWahlperiode: false,
        budget,
        dip,
        mcp: mcpNone,
      });
    expect((await run(mk(false))).notes).toContain(
      'Zu Drucksache 21/8725 liegt im DIP noch keine Antwort vor.'
    );
    expect((await run(mk(true))).notes).toEqual([]);
  });

  it('wiederholt ohne Wahlperiode nur, wenn sie angenommen war', async () => {
    const mk = () =>
      makeDip((_e, p) =>
        'f.wahlperiode' in p
          ? []
          : [
              { id: '1', dokumentnummer: '20/1' },
              { id: '2', dokumentnummer: '20/2' },
              { id: '3', dokumentnummer: '20/3' },
            ]
      );
    const a = mk();
    const ra = await findCandidates({
      question: 'x',
      filters: { wahlperiode: [21], drucksachetyp: ['Antrag'] },
      assumedWahlperiode: true,
      budget,
      dip: a,
      mcp: mcpNone,
    });
    expect(ra.candidates).toHaveLength(3);
    expect(a.calls).toHaveLength(2);
    expect(a.calls[1].params).not.toHaveProperty('f.wahlperiode');
    const b = mk();
    const rb = await findCandidates({
      question: 'x',
      filters: { wahlperiode: [21], drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip: b,
      mcp: mcpNone,
    });
    expect(b.calls[0].params['f.wahlperiode']).toEqual([21]);
    expect(rb.candidates).toHaveLength(0);
  });

  it('nutzt MCP erst unter 3 Kandidaten', async () => {
    const mcp = {
      semanticSearch: vi.fn(async () => ({
        items: [
          {
            dokumentnummer: '21/9',
            docType: 'd',
            docId: '9',
            entityType: null,
            title: 't',
            abstract: null,
            date: null,
            wahlperiode: 21,
            score: 1,
          },
        ],
      })),
    };
    const enough = makeDip(() => [
      { id: '1', dokumentnummer: '21/1' },
      { id: '2', dokumentnummer: '21/2' },
      { id: '3', dokumentnummer: '21/3' },
    ]);
    await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip: enough,
      mcp,
    });
    expect(mcp.semanticSearch).not.toHaveBeenCalled();

    const few = makeDip((_e, p) =>
      'f.dokumentnummer' in p ? [{ id: '9', dokumentnummer: '21/9' }] : []
    );
    const r = await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip: few,
      mcp,
    });
    expect(mcp.semanticSearch).toHaveBeenCalledTimes(1);
    expect(r.candidates.map((c) => c.ref)).toEqual(['21/9']);
    expect(r.notes.length).toBe(1);
  });

  it('ruft MCP schon bei genau 2 Kandidaten', async () => {
    const mcp = { semanticSearch: vi.fn(async () => ({ items: [] })) };
    const dip = makeDip(() => [
      { id: '1', dokumentnummer: '21/1' },
      { id: '2', dokumentnummer: '21/2' },
    ]);
    await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp,
    });
    expect(mcp.semanticSearch).toHaveBeenCalledTimes(1);
  });

  it('unterscheidet MCP-Ausfall von DIP-Fehler im Rückfall', async () => {
    const hit = {
      dokumentnummer: '21/9',
      docType: 'd',
      docId: '9',
      entityType: null,
      title: 't',
      abstract: null,
      date: null,
      wahlperiode: 21,
      score: 1,
    };
    const dip = makeDip((_e, p) => {
      if ('f.dokumentnummer' in p) throw new Error('dip down');
      return [];
    });
    const r1 = await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: { semanticSearch: vi.fn(async () => ({ items: [hit] })) },
    });
    expect(r1.notes[0]).toMatch(/DIP/);
    const r2 = await findCandidates({
      question: 'x',
      filters: { drucksachetyp: ['Antrag'] },
      assumedWahlperiode: false,
      budget,
      dip: makeDip(() => []),
      mcp: {
        semanticSearch: vi.fn(async () => {
          throw new Error('mcp down');
        }),
      },
    });
    expect(r2.notes[0]).toMatch(/semantische Suche war nicht erreichbar/);
  });

  it('behält zwei Debatten desselben Protokolls (gleiche fundstelle.id)', async () => {
    const pos = (a: number, e: number) => ({
      vorgangsposition: 'Beratung',
      datum: '2025-02-01',
      fundstelle: {
        id: '5795',
        dokumentnummer: '21/80',
        drucksachetyp: 'Plenarprotokoll',
        xml_url: 'https://dserver.bundestag.de/btp/21/21080.xml',
        anfangsseite: a,
        endseite: e,
      },
    });
    const dip = makeDip((e) =>
      e === 'vorgang' ? [vorgang] : e === 'vorgangsposition' ? [pos(100, 110), pos(200, 210)] : []
    );
    const r = await findCandidates({
      question: 'x',
      filters: { deskriptor: ['Heizung'], mitBeratung: true },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(r.candidates.map((c) => c.ref)).toEqual([
      'PlPr 21/80 S. 100-110',
      'PlPr 21/80 S. 200-210',
    ]);
  });

  it('ruft drucksache-text nie mit f.vorgang auf', async () => {
    const dip = vorgangDip();
    await findCandidates({
      question: 'x',
      filters: { deskriptor: ['Heizung'], mitBeratung: true },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(dip.calls.filter((c) => c.endpoint === 'drucksache-text')).toEqual([]);
    expect(dip.calls.some((c) => c.endpoint === 'drucksache-text' && 'f.vorgang' in c.params)).toBe(
      false
    );
  });

  describe('urheber über Vorgang', () => {
    const antwortVorgang = { id: '77', titel: 'Wärmepumpen', initiative: ['Fraktion der AfD'] };
    const antwortPositions = [
      {
        vorgangsposition: 'Kleine Anfrage',
        datum: '2025-01-01',
        fundstelle: {
          id: 'k1',
          dokumentnummer: '21/100',
          drucksachetyp: 'Kleine Anfrage',
          urheber: ['Fraktion der AfD'],
        },
      },
      {
        vorgangsposition: 'Antwort',
        datum: '2025-02-01',
        fundstelle: {
          id: 'a1',
          dokumentnummer: '21/200',
          drucksachetyp: 'Antwort',
          urheber: ['Bundesregierung'],
        },
      },
      {
        vorgangsposition: 'Antwort',
        datum: '2025-02-02',
        fundstelle: {
          id: 'a2',
          dokumentnummer: '21/201',
          drucksachetyp: 'Antwort',
          urheber: ['Fraktion der SPD'],
        },
      },
      {
        vorgangsposition: 'Antwort',
        datum: '2025-02-03',
        fundstelle: { id: 'a3', dokumentnummer: '21/202', drucksachetyp: 'Antwort' },
      },
    ];
    const dipFor = () =>
      makeDip((e) =>
        e === 'vorgang' ? [antwortVorgang] : e === 'vorgangsposition' ? antwortPositions : []
      );

    it('sendet f.initiative nicht bei Antwort und filtert stattdessen nach Fundstellen-Urheber', async () => {
      const dip = dipFor();
      const r = await findCandidates({
        question: 'x',
        filters: {
          drucksachetyp: ['Antwort'],
          urheber: ['Bundesregierung'],
          deskriptor: ['Wärmepumpe'],
        },
        assumedWahlperiode: false,
        budget,
        dip,
        mcp: mcpNone,
      });
      expect(Object.keys(dip.calls[0].params)).not.toContain('f.initiative');
      // Fraktions-Antwort fliegt raus, die ohne Urheber bleibt und wird einmal angemerkt.
      expect(r.candidates.map((c) => c.ref)).toEqual(['21/200', '21/202']);
      expect(r.candidates[0].urheber).toEqual(['Bundesregierung']);
      expect(r.notes.filter((n) => n.includes('Urheber-Angabe'))).toHaveLength(1);
    });

    it('sendet f.initiative bei Initiator-Typen oder ohne Typ weiter', async () => {
      const cases: BundestagFilter[] = [
        {
          drucksachetyp: ['Antrag', 'Kleine Anfrage'],
          urheber: ['Fraktion der AfD'],
          deskriptor: ['x'],
        },
        { urheber: ['Fraktion der AfD'] },
      ];
      for (const filters of cases) {
        const dip = dipFor();
        await findCandidates({
          question: 'x',
          filters,
          assumedWahlperiode: false,
          budget,
          dip,
          mcp: mcpNone,
        });
        expect(dip.calls[0].params['f.initiative']).toBe('Fraktion der AfD');
      }
    });
  });
});

describe('findCandidates beratungsstand', () => {
  const fs = (id: string, nr: string, typ: string) => ({
    vorgangsposition: typ,
    datum: '2025-03-01',
    fundstelle: { id, dokumentnummer: nr, drucksachetyp: typ, pdf_url: `https://x/${id}.pdf` },
  });
  it('schickt f.beratungsstand an den Vorgang, nimmt den Vorgangsweg und stellt den Beschluss voran', async () => {
    const dip = makeDip((e) => {
      if (e === 'vorgang') return [vorgang];
      return [
        fs('a', '21/1', 'Kleine Anfrage'),
        fs('b', '21/2', 'Antwort'),
        fs('c', '21/3', 'Gesetzentwurf'),
        fs('d', '21/4', 'Beschlussempfehlung und Bericht'),
      ];
    });
    const r = await findCandidates({
      question: 'q',
      filters: { beratungsstand: ['Verkündet', 'Angenommen'], wahlperiode: [21] },
      assumedWahlperiode: false,
      budget,
      dip,
      mcp: mcpNone,
    });
    expect(dip.calls.every((c) => c.endpoint !== 'drucksache')).toBe(true);
    expect(dip.calls[0].endpoint).toBe('vorgang');
    expect(dip.calls[0].params['f.beratungsstand']).toEqual(['Verkündet', 'Angenommen']);
    expect(r.candidates.map((c) => c.ref)).toEqual(['21/4', '21/3', '21/1', '21/2']);
  });

  describe('Beratungsverlauf', () => {
    const gesetz = {
      id: '329526',
      titel: 'Bundesjagdgesetz',
      initiative: ['Bundesregierung'],
      verkuendung: [
        {
          verkuendungsdatum: '2026-04-01',
          fundstelle: 'BGBl I 2026, 87',
          pdf_url: 'https://www.recht.bund.de/eli/bund/BGBl_1/2026/87',
        },
      ],
    };
    const gesetzPositions = [
      {
        vorgangsposition: 'Gesetzentwurf',
        zuordnung: 'BT',
        datum: '2026-01-12',
        fundstelle: {
          id: 'g1',
          dokumentart: 'Drucksache',
          dokumentnummer: '21/3546',
          drucksachetyp: 'Gesetzentwurf',
        },
      },
      {
        vorgangsposition: 'Beschlussempfehlung und Bericht',
        zuordnung: 'BT',
        datum: '2026-02-26',
        fundstelle: {
          id: 'b1',
          dokumentart: 'Drucksache',
          dokumentnummer: '21/4371',
          drucksachetyp: 'Beschlussempfehlung und Bericht',
        },
      },
      {
        vorgangsposition: '3. Beratung',
        zuordnung: 'BT',
        datum: '2026-03-05',
        fundstelle: {
          id: 'p62',
          dokumentart: 'Plenarprotokoll',
          dokumentnummer: '21/62',
          xml_url: 'https://dserver.bundestag.de/btp/21/21062.xml',
          anfangsseite: 7524,
          endseite: 7524,
        },
        beschlussfassung: [{ beschlusstenor: 'Annahme in Ausschussfassung', seite: '7524B' }],
      },
      {
        vorgangsposition: '2. Durchgang',
        zuordnung: 'BR',
        datum: '2026-03-27',
        fundstelle: {
          id: 'br1063',
          dokumentart: 'Plenarprotokoll',
          dokumentnummer: '1063',
          xml_url: 'x',
          anfangsseite: 138,
          endseite: 139,
        },
        beschlussfassung: [{ beschlusstenor: 'Zustimmung', seite: '139' }],
      },
      {
        vorgangsposition: 'Unterrichtung über Gesetzesbeschluss des BT',
        zuordnung: 'BR',
        datum: '2026-03-06',
        fundstelle: {
          id: 'br117',
          dokumentart: 'Drucksache',
          dokumentnummer: '117/26',
          drucksachetyp: 'Gesetzesbeschluss',
        },
      },
    ];

    it('hängt Beschlüsse aus Bundestag und Bundesrat samt Verkündung an, Kandidaten bleiben BT', async () => {
      const dip = makeDip((e) =>
        e === 'vorgang' ? [gesetz] : e === 'vorgangsposition' ? gesetzPositions : []
      );
      const r = await findCandidates({
        question: 'x',
        filters: { titel: 'Bundesjagdgesetz', mitBeratung: true },
        assumedWahlperiode: false,
        budget,
        dip,
        mcp: mcpNone,
      });
      expect(r.candidates.map((c) => c.ref)).toEqual([
        '21/3546',
        '21/4371',
        'PlPr 21/62 S. 7524-7524',
      ]);
      const pos = dip.calls.find((c) => c.endpoint === 'vorgangsposition');
      expect(pos?.params).not.toHaveProperty('f.zuordnung');
      const verlauf = r.candidates[0]?.verlauf;
      expect(verlauf?.schritte.map((s) => s.position)).toEqual([
        'Beschlussempfehlung und Bericht',
        '3. Beratung',
        '2. Durchgang',
      ]);
      expect(verlauf?.schritte[2]).toMatchObject({
        gremium: 'BR',
        fundstelle: 'BR-Plenarprotokoll 1063',
        beschluesse: [{ tenor: 'Zustimmung', seite: '139', abstimmung: null }],
      });
      expect(verlauf?.verkuendung).toEqual({
        datum: '2026-04-01',
        fundstelle: 'BGBl I 2026, 87',
        pdfUrl: 'https://www.recht.bund.de/eli/bund/BGBl_1/2026/87',
      });
      expect(r.candidates.every((c) => c.verlauf === verlauf)).toBe(true);
    });

    it('holt bei abgeschnittener Positionsliste die BT-Positionen nach', async () => {
      const calls: Call[] = [];
      const dip: FindDip = {
        list: (async (endpoint: string, params: Record<string, unknown>) => {
          calls.push({ endpoint, params });
          if (endpoint === 'vorgang') return { numFound: 1, cursor: null, documents: [gesetz] };
          if (endpoint === 'vorgangsposition' && params['f.zuordnung'] === 'BT') {
            return { numFound: 1, cursor: null, documents: [gesetzPositions[0]] };
          }
          return { numFound: 250, cursor: 'c', documents: gesetzPositions.slice(3) };
        }) as unknown as FindDip['list'],
      };
      const r = await findCandidates({
        question: 'x',
        filters: { titel: 'Bundesjagdgesetz' },
        assumedWahlperiode: false,
        budget,
        dip,
        mcp: mcpNone,
      });
      expect(r.candidates.map((c) => c.ref)).toContain('21/3546');
      expect(calls.filter((c) => c.endpoint === 'vorgangsposition')).toHaveLength(2);
    });

    it('lädt die Verkündung beim Nummernweg in einem Abruf nur für Gesetzgebung', async () => {
      const dip = makeDip((e, params) =>
        e === 'drucksache'
          ? [
              {
                id: 'g1',
                dokumentnummer: '21/3546',
                drucksachetyp: 'Gesetzentwurf',
                vorgangsbezug: [
                  { id: '329526', titel: 'Bundesjagdgesetz', vorgangstyp: 'Gesetzgebung' },
                ],
              },
            ]
          : e === 'vorgang'
            ? (expect(params['f.id']).toEqual(['329526']), [gesetz])
            : e === 'vorgangsposition'
              ? gesetzPositions
              : []
      );
      const r = await findCandidates({
        question: 'x',
        filters: { dokumentnummer: ['21/3546'] },
        assumedWahlperiode: false,
        budget,
        dip,
        mcp: mcpNone,
      });
      expect(r.candidates[0]?.verlauf?.verkuendung?.fundstelle).toBe('BGBl I 2026, 87');
      expect(dip.calls.filter((c) => c.endpoint === 'vorgang')).toHaveLength(1);
    });
  });
});
