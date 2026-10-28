import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CHAT_BUDGET } from '../../../services/bundestag/qa/budget.js';
import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  makeAbgeordnetenwatchTool,
  makeBundestagRedenTool,
  makeBundestagTool,
  makeCreateBoardTool,
  makeCreateDocTool,
  makeCreateSharepicTool,
  makeImageTool,
  makeParlamentLesenTool,
  makeSummaryTool,
} from './domainTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const summarizeNode = vi.fn<(s: unknown) => Promise<unknown>>();
const imageNode = vi.fn<(s: unknown) => Promise<unknown>>();
// Die beiden Parlaments-Werkzeuge rufen den Kern, nicht den Knoten — deshalb
// steht die Attrappe hier am Kern. Dass der Kern seinen Dienst wirklich
// erreicht, prüft `domainToolsDelegation.vitest.ts` am ECHTEN Knoten.
const retrieveBundestag = vi.fn<(q: string, l: unknown, f: unknown) => Promise<unknown>>();
const readBundestagRefs = vi.fn<(o: unknown) => Promise<unknown>>();
const countBundestagDocs = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../../../services/bundestag/qa/index.js', () => ({
  readBundestagRefs: (o: unknown): Promise<unknown> => readBundestagRefs(o),
  countBundestagDocs: (o: unknown): Promise<unknown> => countBundestagDocs(o),
}));
// Nur die Suche ist Attrappe; Filter, Titel und URL laufen echt.
const searchBundestagReden = vi.fn<(s: unknown) => Promise<unknown>>();
vi.mock('../../../services/bundestag/reden.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchBundestagReden: (s: unknown): Promise<unknown> => searchBundestagReden(s),
}));
const retrieveAbgeordnetenwatch = vi.fn<(q: string, l: unknown) => Promise<unknown>>();
const retrieveBundestagFamily = vi.fn<(r: string, l: unknown) => Promise<unknown>>();
vi.mock('../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  retrieveBundestagFamily: (r: string, l: unknown): Promise<unknown> =>
    retrieveBundestagFamily(r, l),
  retrieveBundestag: (q: string, l: unknown, f: unknown): Promise<unknown> =>
    retrieveBundestag(q, l, f),
  retrieveAbgeordnetenwatch: (q: string, l: unknown): Promise<unknown> =>
    retrieveAbgeordnetenwatch(q, l),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js', () => ({
  summarizeNode: (s: unknown): Promise<unknown> => summarizeNode(s),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/imageNode.js', () => ({
  imageNode: (s: unknown): Promise<unknown> => imageNode(s),
}));
const runSharepicGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
const runDocGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
const runBoardGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../services/intentExecutionService.js', () => ({
  runSharepicGeneration: (o: unknown): Promise<unknown> => runSharepicGeneration(o),
  runDocGeneration: (o: unknown): Promise<unknown> => runDocGeneration(o),
  runBoardGeneration: (o: unknown): Promise<unknown> => runBoardGeneration(o),
}));

type SseEvent = { type: string; payload: unknown };
function fakeSse(sink: SseEvent[]) {
  return {
    send: (type: string, payload: unknown) => sink.push({ type, payload }),
  } as unknown as Parameters<typeof makeSummaryTool>[0]['sse'];
}

const baseState = {
  intent: 'search',
  searchQuery: null,
  userLocale: 'de-DE',
  documentIds: [],
  documentChatIds: [],
} as unknown as ChatGraphState;

function exec(tool: unknown, input: unknown) {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

describe('makeSummaryTool', () => {
  beforeEach(() => summarizeNode.mockReset());

  it('emits summary_start/summary_complete and returns the digest', async () => {
    summarizeNode.mockResolvedValue({ summaryContext: 'Kurzfassung.', summaryTimeMs: 1200 });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'summary',
      documentIds: ['d1', 'd2'],
      documentChatIds: ['dc1'],
    } as unknown as ChatGraphState;
    const out = (await exec(makeSummaryTool({ sse: fakeSse(events), state }), {})) as {
      summary?: string;
    };
    expect(out.summary).toBe('Kurzfassung.');
    expect(events.map((e) => e.type)).toEqual(['summary_start', 'summary_complete']);
    expect((events[0].payload as { documentCount: number }).documentCount).toBe(3);
    expect((events[1].payload as { summaryLength: number }).summaryLength).toBe(
      'Kurzfassung.'.length
    );
  });

  it('returns an error result when nothing could be summarized', async () => {
    summarizeNode.mockResolvedValue({ summaryContext: '', summaryTimeMs: 5 });
    const events: SseEvent[] = [];
    const out = (await exec(
      makeSummaryTool({
        sse: fakeSse(events),
        state: { ...baseState, intent: 'summary' } as ChatGraphState,
      }),
      {}
    )) as { error?: string; summary?: string };
    expect(out.error).toBeTruthy();
    expect(out.summary).toBeUndefined();
    // summary_complete still fires so the progress indicator resolves.
    expect(events.map((e) => e.type)).toEqual(['summary_start', 'summary_complete']);
  });
});

describe('makeBundestagRedenTool', () => {
  // Block statt Ausdruck: ein von beforeEach zurückgegebener Wert gilt als
  // Aufräum-Funktion, und Vitest riefe die Attrappe sonst nach dem Test auf.
  beforeEach(() => {
    searchBundestagReden.mockReset();
  });

  const rede = {
    speaker: 'Katrin Uhlig',
    party: 'GRÜNE',
    date: '2025-05-23',
    excerpt: 'Wärmeplanung ist Planungssicherheit. ENDE',
    protokollNummer: '21/8',
    wahlperiode: 21,
    herausgeber: 'BT',
    topTitle: null,
    score: 0.75,
  };
  const make = (state: Partial<ChatGraphState> = {}, sourceRegistry = createSourceRegistry()) =>
    makeBundestagRedenTool({
      state: { ...baseState, ...state } as ChatGraphState,
      sourceRegistry,
    });

  it('registriert je Rede eine Quelle mit Redetext und Protokoll-PDF, Karte nur in uiCard', async () => {
    searchBundestagReden.mockResolvedValue({ speeches: [rede], wpFallback: false });
    const sourceRegistry = createSourceRegistry();
    const out = (await exec(
      make(
        { lastUserTextNoMentions: 'Wann hat Katrin Uhlig zuletzt über Wärmeplanung gesprochen?' },
        sourceRegistry
      ),
      { thema: 'Wärmeplanung', redner: 'Katrin Uhlig' }
    )) as { resultCount: number; sources: string; uiCard: Record<string, unknown> };
    expect(searchBundestagReden).toHaveBeenCalledWith({
      thema: 'Wärmeplanung',
      redner: 'Katrin Uhlig',
      sortierung: 'neueste',
    });
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('Rede Katrin Uhlig (GRÜNE) · Plenarprotokoll 21/8 · 23.05.2025');
    expect(out.sources).toContain('ENDE');
    expect(sourceRegistry.renderAll()).toContain('https://dserver.bundestag.de/btp/21/21008.pdf');
    expect(out.uiCard).toEqual({
      thema: 'Wärmeplanung',
      filter: ['Redner*in: Katrin Uhlig', 'Sortierung: neueste zuerst'],
      reden: [
        {
          redner: 'Katrin Uhlig',
          partei: 'GRÜNE',
          datum: '2025-05-23',
          protokoll: '21/8',
          top: null,
          url: 'https://dserver.bundestag.de/btp/21/21008.pdf',
        },
      ],
    });
  });

  it('gesetzte Argumente schlagen den Wortlaut', async () => {
    searchBundestagReden.mockResolvedValue({ speeches: [], wpFallback: false });
    const out = (await exec(make({ lastUserTextNoMentions: 'Was sagt die SPD seit 2025?' }), {
      thema: 'Rente',
      fraktion: 'Union',
    })) as { error?: string };
    expect(searchBundestagReden).toHaveBeenCalledWith({
      thema: 'Rente',
      datumVon: '2025-01-01',
      fraktion: 'Union',
    });
    expect(out.error).toBe('Keine passenden Reden gefunden.');
  });

  it('meldet einen Ausfall als Ausfall', async () => {
    searchBundestagReden.mockImplementation(async () => {
      throw new Error('down');
    });
    const out = (await exec(make(), { thema: 'x y' })) as { error?: string };
    expect(out.error).toContain('nicht erreichbar');
  });

  it('sperrt Österreich, ohne zu suchen', async () => {
    const out = (await exec(make({ userLocale: 'de-AT' }), { thema: 'x y' })) as {
      error?: string;
    };
    expect(out.error).toBeTruthy();
    expect(searchBundestagReden).not.toHaveBeenCalled();
  });
});

describe('makeParlamentLesenTool', () => {
  beforeEach(() => readBundestagRefs.mockReset());

  const doc = {
    ref: '21/1928',
    dokumentnummer: '21/1928',
    drucksachetyp: 'Gesetzentwurf',
    titel: 'T',
    datum: '2025-10-01',
    urheber: ['Bundesregierung'],
    pdfUrl: 'https://dserver.bundestag.de/btd/21/019/2101928.pdf',
    textSource: 'pdf',
    relevant: true,
    points: [{ aussage: 'Das Gesetz kommt.', zitat: 'Es tritt in Kraft.', method: 'exact' }],
    droppedPoints: 0,
    windowsRead: 1,
    windowsTotal: 1,
    skipped: null,
  };
  const make = (locale = 'de-DE') =>
    makeParlamentLesenTool({
      state: { ...baseState, userLocale: locale } as ChatGraphState,
      sourceRegistry: createSourceRegistry(),
    });

  it('reicht Refs, Auftrag und CHAT_BUDGET an den Dienst und registriert die Treffer', async () => {
    readBundestagRefs.mockResolvedValue({ documents: [doc], notes: [] });
    const out = (await exec(make(), {
      quelle: 'bundestag',
      dokumente: ['21/1928'],
      frage: 'Was regelt das Gesetz?',
      auftrag: 'zusammenfassung',
    })) as { resultCount: number; sources: string; nichtGelesen: unknown[] };
    expect(readBundestagRefs).toHaveBeenCalledWith({
      question: 'Was regelt das Gesetz?',
      refs: ['21/1928'],
      auftrag: 'zusammenfassung',
      budget: CHAT_BUDGET,
    });
    expect(out.resultCount).toBe(1);
    expect(out.nichtGelesen).toEqual([]);
    expect(out.sources).toContain('BT-Drs. 21/1928 · Gesetzentwurf · 01.10.2025 · Bundesregierung');
    expect(out.sources).toContain('• Das Gesetz kommt. — „Es tritt in Kraft.“');
  });

  it('listet übersprungene Dokumente mit Grund unter nichtGelesen', async () => {
    readBundestagRefs.mockResolvedValue({
      documents: [
        doc,
        { ...doc, ref: '21/2', points: [], skipped: 'missing' },
        { ...doc, ref: '21/3', points: [], skipped: 'budget' },
        { ...doc, ref: '21/4', points: [], skipped: null },
      ],
      notes: ['Nicht gefunden bei DIP: 21/5.'],
    });
    const out = (await exec(make(), {
      quelle: 'bundestag',
      dokumente: ['21/1928', '21/2', '21/3', '21/4'],
      frage: 'Frage?',
    })) as {
      resultCount: number;
      nichtGelesen: { ref: string; grund: string }[];
      hinweise: string[];
    };
    expect(readBundestagRefs.mock.calls[0]![0]).toMatchObject({ auftrag: 'frage' });
    expect(out.resultCount).toBe(1);
    expect(out.nichtGelesen).toEqual([
      { ref: '21/2', grund: 'kein Volltext verfügbar' },
      { ref: '21/3', grund: 'Lesebudget erschöpft' },
      { ref: '21/4', grund: 'keine belegte Aussage zur Frage' },
    ]);
    expect(out.hinweise).toEqual(['Nicht gefunden bei DIP: 21/5.']);
  });

  it('meldet einen Fehler mit Grund, wenn kein einziges Dokument gelesen wurde', async () => {
    // Live 28.10.2026, Antwort 21/8813: die PDF lag noch nicht auf dem Server
    // (404), das Ergebnis war ein nacktes „0 Ergebnisse" mit ok=true.
    readBundestagRefs.mockResolvedValue({
      documents: [{ ...doc, ref: '21/8813', points: [], skipped: 'missing' }],
      notes: [],
    });
    const out = (await exec(make(), {
      quelle: 'bundestag',
      dokumente: ['21/8813'],
      frage: 'Was hat die Bundesregierung geantwortet?',
    })) as { resultCount: number; error: string; nichtGelesen: { ref: string }[] };
    expect(out.resultCount).toBe(0);
    expect(out.error).toContain('Nichts gelesen');
    expect(out.error).toContain('21/8813: kein Volltext verfügbar');
    expect(out.error).toContain('noch nicht');
    expect(out.nichtGelesen).toHaveLength(1);
  });

  it('lehnt für de-AT ab, ohne den Dienst zu rufen', async () => {
    const out = (await exec(make('de-AT'), {
      quelle: 'bundestag',
      dokumente: ['21/1'],
      frage: 'Frage?',
    })) as { resultCount: number; error: string };
    expect(readBundestagRefs).not.toHaveBeenCalled();
    expect(out.resultCount).toBe(0);
    expect(out.error).toBeTruthy();
  });

  it('das Schema lehnt ungültige Refs, leere Listen und mehr als 6 Dokumente ab', () => {
    const schema = (
      make() as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }
    ).inputSchema;
    const ok = { quelle: 'bundestag', dokumente: ['21/1'], frage: 'Frage?' };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, dokumente: ['kaputt'] }).success).toBe(false);
    expect(schema.safeParse({ ...ok, dokumente: [] }).success).toBe(false);
    expect(
      schema.safeParse({ ...ok, dokumente: Array.from({ length: 7 }, (_, i) => `21/${i + 1}`) })
        .success
    ).toBe(false);
    expect(schema.safeParse({ ...ok, quelle: 'bundesrat' }).success).toBe(false);
  });
});

describe('makeBundestagTool', () => {
  beforeEach(() => retrieveBundestag.mockReset());

  it('registers results with a raised snippet cap and returns the lean sources shape', async () => {
    const longExcerpt = `Rede zur Klimapolitik. ${'x'.repeat(500)} ENDE`;
    retrieveBundestag.mockResolvedValue({
      results: [
        {
          source: 'bundestag',
          url: 'https://dip.bundestag.de/x',
          title: 'Drucksache 21/50 · Antrag',
          content: longExcerpt,
        },
      ],
      totals: { vorgaenge: 4, drucksachen: 9 },
    });
    const sourceRegistry = createSourceRegistry();
    const out = (await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry,
      }),
      { query: 'Klima' }
    )) as {
      resultCount?: number;
      sources?: string;
      gesamt?: unknown;
      hinweis?: string;
    };
    expect(out.resultCount).toBe(1);
    expect(out.gesamt).toEqual({ vorgaenge: 4, drucksachen: 9 });
    expect(out.hinweis).toBe(
      "Die Liste enthält nur Metadaten. Für Inhalte `parlament_lesen` mit quelle 'bundestag' aufrufen: bei einer Themen- oder Listenfrage alle einschlägigen Refs (bis zu 6) in einem Aufruf, nicht nur das erste Dokument."
    );
    // The 700-char registration cap keeps the full ~530-char excerpt intact
    // (the default 320 would cut it before "ENDE").
    expect(out.sources).toContain('ENDE');
    expect(out.sources).toContain('[1] Drucksache 21/50 · Antrag');
    expect(sourceRegistry.renderAll()).toContain('ENDE');
    expect(sourceRegistry.size).toBe(1);
    // Der Kern bekommt die Anfrage des Modells und das Locale des Turns.
    expect(retrieveBundestag).toHaveBeenCalledWith('Klima', 'de-DE', {});
  });

  it('reicht die Filter des Modells an den Kern weiter, aber nicht die Anfrage selbst', async () => {
    retrieveBundestag.mockResolvedValue({ results: [], totals: null });
    await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Heizung', wahlperiode: [21], drucksachetyp: ['Antrag'], datumVon: '2025-01-01' }
    );
    expect(retrieveBundestag).toHaveBeenCalledWith('Heizung', 'de-DE', {
      wahlperiode: [21],
      drucksachetyp: ['Antrag'],
      datumVon: '2025-01-01',
    });
  });

  it('ergänzt Filter aus dem Wortlaut der Nachricht, wenn das Modell nur das Thema übergibt', async () => {
    retrieveBundestag.mockResolvedValue({ results: [], totals: null });
    await exec(
      makeBundestagTool({
        state: {
          ...baseState,
          intent: 'bundestag',
          lastUserTextNoMentions: 'Welche Anträge der Grünen zum Artenschutz wurden abgelehnt?',
        } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Artenschutz', drucksachetyp: ['Gesetzentwurf'] }
    );
    expect(retrieveBundestag).toHaveBeenCalledWith('Artenschutz', 'de-DE', {
      drucksachetyp: ['Gesetzentwurf'],
      urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN'],
      beratungsstand: ['Abgelehnt'],
    });
  });

  it('nimmt einen Aufruf nur mit Filtern an und reicht die Frage als Thema weiter', async () => {
    retrieveBundestag.mockResolvedValue({ results: [], totals: null });
    const out = (await exec(
      makeBundestagTool({
        state: {
          ...baseState,
          intent: 'bundestag',
          lastUserTextNoMentions: 'Was wurde zum Artenschutz beschlossen?',
        } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { deskriptor: ['Artenschutz'], beratungsstand: ['Angenommen'] }
    )) as { error?: string };
    expect(out.error).toBe('Keine passenden Bundestags-Daten gefunden.');
    expect(retrieveBundestag).toHaveBeenCalledWith(
      'Was wurde zum Artenschutz beschlossen?',
      'de-DE',
      expect.objectContaining({ deskriptor: ['Artenschutz'], beratungsstand: ['Angenommen'] })
    );
  });

  it('nimmt einen Aufruf ganz ohne Argumente an, wenn die Nachricht das Thema trägt', async () => {
    retrieveBundestag.mockResolvedValue({ results: [], totals: null });
    await exec(
      makeBundestagTool({
        state: {
          ...baseState,
          intent: 'bundestag',
          lastUserTextNoMentions: 'Welche Anträge zum Artenschutz gab es?',
        } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      {}
    );
    expect(retrieveBundestag.mock.calls[0]![0]).toBe('Welche Anträge zum Artenschutz gab es?');
  });

  it('lehnt nur ab, wenn weder Suchbegriff noch Ref noch Filter noch Nachricht da sind', async () => {
    const out = (await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag', lastUserTextNoMentions: '' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { deskriptor: [] }
    )) as { error?: string };
    expect(out.error).toMatch(/fehlt/);
    expect(retrieveBundestag).not.toHaveBeenCalled();
  });

  it('registers the de-AT decline note as a citable source', async () => {
    retrieveBundestag.mockResolvedValue({
      results: [
        {
          source: 'bundestag',
          url: '',
          title: 'Nur für Deutschland verfügbar',
          content: 'Nur für Deutschland.',
        },
      ],
      totals: null,
    });
    const out = (await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'x' }
    )) as { resultCount?: number; sources?: string };
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('Nur für Deutschland.');
  });

  it('returns an error shape when the search comes back empty', async () => {
    retrieveBundestag.mockResolvedValue({ results: [], totals: null });
    const out = (await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'x' }
    )) as { resultCount?: number; error?: string };
    expect(out.resultCount).toBe(0);
    expect(out.error).toBeTruthy();
  });
});

describe('Karten-Daten (uiCard)', () => {
  it('bundestag liefert Filter in Worten und die Dokumentliste', async () => {
    retrieveBundestag.mockResolvedValue({
      results: [{ source: 'bundestag', title: 'T', content: 'c' }],
      totals: { vorgaenge: 62, drucksachen: 10 },
      filters: { wahlperiode: [21], drucksachetyp: ['Antrag'], datumVon: '2025-01-01' },
      documents: [
        {
          ref: '21/1928',
          drucksachetyp: 'Antrag',
          datum: '2025-10-01',
          titel: 'Titel',
          urheber: [],
          pdfUrl: null,
        },
      ],
    });
    const out = (await exec(
      makeBundestagTool({
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Heizung' }
    )) as { uiCard: { filter: string[]; dokumente: { ref: string }[] } };
    expect(out.uiCard.filter).toEqual([
      'Wahlperiode: 21',
      'Typ: Antrag',
      'Zeitraum: ab 01.01.2025',
    ]);
    expect(out.uiCard.dokumente[0]?.ref).toBe('BT-Drs. 21/1928');
  });

  it('parlament_lesen liefert gelesen und nichtGelesen', async () => {
    readBundestagRefs.mockResolvedValue({
      documents: [
        {
          ref: '21/1928',
          titel: 'T',
          drucksachetyp: 'Antrag',
          datum: '2025-10-01',
          urheber: [],
          dokumentnummer: '21/1928',
          pdfUrl: null,
          points: [{ aussage: 'a', zitat: 'z', method: 'exact' }],
          skipped: null,
        },
        {
          ref: '21/2',
          titel: 'U',
          drucksachetyp: 'Antrag',
          datum: '2025-10-01',
          urheber: [],
          dokumentnummer: '21/2',
          pdfUrl: null,
          points: [],
          skipped: 'missing',
        },
      ],
      notes: [],
    });
    const out = (await exec(
      makeParlamentLesenTool({
        state: { ...baseState, userLocale: 'de-DE' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { quelle: 'bundestag', dokumente: ['21/1928', '21/2'], frage: 'Frage?' }
    )) as { uiCard: { gelesen: { aussagen: number }[]; nichtGelesen: { grund: string }[] } };
    expect(out.uiCard.gelesen[0]?.aussagen).toBe(1);
    expect(out.uiCard.nichtGelesen[0]?.grund).toBe('kein Volltext verfügbar');
  });
});

describe('bundestag: modus zaehlen, ref', () => {
  const state = { ...baseState, intent: 'bundestag' } as ChatGraphState;
  beforeEach(() => {
    retrieveBundestag.mockReset();
    retrieveBundestagFamily.mockReset();
    countBundestagDocs.mockReset();
  });
  const schemaOf = (t: unknown) =>
    (t as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;

  it('das Schema nimmt die neuen Felder an, die alten Aufrufe bleiben gültig', () => {
    const schema = schemaOf(makeBundestagTool({ state, sourceRegistry: createSourceRegistry() }));
    expect(schema.safeParse({ query: 'Klima' }).success).toBe(true);
    expect(schema.safeParse({ query: 'x', modus: 'zaehlen', gruppieren: 'monat' }).success).toBe(
      true
    );
    expect(schema.safeParse({ ref: '21/3546' }).success).toBe(true);
    expect(schema.safeParse({ query: 'x', modus: 'summe' }).success).toBe(false);
    expect(schema.safeParse({ query: 'x', gruppieren: 'land' }).success).toBe(false);
  });

  it('zaehlen: Filter aus Argumenten und Wortlaut, Zahlen als Quelle und Karte, keine Suche', async () => {
    countBundestagDocs.mockResolvedValue({
      einheit: 'Drucksachen',
      gesamt: 40,
      gruppen: [{ label: 'Fraktion der SPD', n: 10 }],
      gruppiertNach: 'fraktion',
      filters: { wahlperiode: [21], drucksachetyp: ['Kleine Anfrage'] },
      notes: ['Hinweis A'],
      aufrufe: 8,
    });
    const sourceRegistry = createSourceRegistry();
    const out = (await exec(
      makeBundestagTool({
        state: {
          ...state,
          lastUserTextNoMentions: 'Wie viele Kleine Anfragen gab es je Fraktion?',
        } as ChatGraphState,
        sourceRegistry,
      }),
      { modus: 'zaehlen', gruppieren: 'fraktion', wahlperiode: [21] }
    )) as Record<string, any>;
    expect(retrieveBundestag).not.toHaveBeenCalled();
    expect(countBundestagDocs).toHaveBeenCalledWith({
      filters: { drucksachetyp: ['Kleine Anfrage'], wahlperiode: [21] },
      gruppieren: 'fraktion',
    });
    expect(out['gesamt']).toBe(40);
    expect(out['einheit']).toBe('Drucksachen');
    expect(out['sources']).toContain('| Fraktion der SPD | 10 |');
    expect(out['uiCard'].modus).toBe('zaehlen');
    expect(out['uiCard'].zaehlung.gruppen).toEqual([{ label: 'Fraktion der SPD', n: 10 }]);
  });

  it('Landtag-Frage: der Geltungsbereich geht als `fuerSchreiber` mit, nicht als Planer-`hinweis`', async () => {
    countBundestagDocs.mockResolvedValue({
      einheit: 'Drucksachen',
      gesamt: 1,
      filters: {},
      notes: [],
      aufrufe: 1,
    });
    const run = (text: string) =>
      exec(
        makeBundestagTool({
          state: { ...state, lastUserTextNoMentions: text } as ChatGraphState,
          sourceRegistry: createSourceRegistry(),
        }),
        { modus: 'zaehlen' }
      ) as Promise<Record<string, unknown>>;
    const landtag = await run('Was hat der Landtag in NRW zu Windkraft beschlossen?');
    expect(landtag['fuerSchreiber']).toMatch(/nur den Bundestag/);
    expect(String(landtag['hinweis'] ?? '')).not.toMatch(/Landesparlament/);
    const bund = await run('Wie viele Anträge zu Windkraft gab es?');
    expect(bund['fuerSchreiber']).toBeUndefined();
  });

  it('zaehlen meldet einen DIP-Ausfall als Fehler', async () => {
    countBundestagDocs.mockRejectedValue(new Error('down'));
    const out = (await exec(makeBundestagTool({ state, sourceRegistry: createSourceRegistry() }), {
      modus: 'zaehlen',
    })) as { error: string; resultCount: number };
    expect(out.resultCount).toBe(0);
    expect(out.error).toMatch(/nicht erreichbar/);
  });

  it('ref: Familie statt Suche, Wortlautfilter gelten nicht, Karte zeigt die Ref', async () => {
    retrieveBundestagFamily.mockResolvedValue({
      results: [
        { source: 'bundestag', title: 'Drucksache 21/3546 · Kleine Anfrage', content: 'a' },
        { source: 'bundestag', title: 'Drucksache 21/4000 · Antwort', content: 'b' },
      ],
      totals: { vorgaenge: 1, drucksachen: 2 },
      documents: [
        {
          ref: '21/4000',
          drucksachetyp: 'Antwort',
          datum: '2026-01-01',
          titel: 'T',
          urheber: [],
          pdfUrl: null,
        },
      ],
      verfahren: [{ titel: 'V', zeilen: ['z'] }],
      notes: [],
    });
    const out = (await exec(
      makeBundestagTool({
        state: {
          ...state,
          lastUserTextNoMentions: 'Gibt es eine Antwort der Grünen?',
        } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { ref: '21/3546' }
    )) as Record<string, any>;
    expect(retrieveBundestagFamily).toHaveBeenCalledWith('21/3546', 'de-DE');
    expect(retrieveBundestag).not.toHaveBeenCalled();
    expect(out['resultCount']).toBe(2);
    expect(out['sources']).toContain('Antwort');
    expect(out['uiCard'].ref).toBe('BT-Drs. 21/3546');
    expect(out['uiCard'].dokumente[0].ref).toBe('BT-Drs. 21/4000');
  });

  it('Landtag in der Frage: der Hinweis verlangt zuerst den Geltungsbereich, der Aufruf läuft weiter', async () => {
    retrieveBundestag.mockResolvedValue({
      results: [{ source: 'bundestag', title: 'Drucksache 21/50', content: 'x' }],
    });
    const out = (await exec(
      makeBundestagTool({
        state: {
          ...state,
          lastUserTextNoMentions: 'Was hat der Landtag NRW zu Windkraft beschlossen?',
        } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Windkraft' }
    )) as { hinweis: string; fuerSchreiber?: string; resultCount: number };
    expect(retrieveBundestag).toHaveBeenCalled();
    expect(out.resultCount).toBe(1);
    expect(out.fuerSchreiber).toMatch(/nur den Bundestag/);
    expect(out.fuerSchreiber).toMatch(/Landesparlament|Landtag/);
    const ohne = (await exec(
      makeBundestagTool({
        state: { ...state, lastUserTextNoMentions: 'Windkraft im Bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Windkraft' }
    )) as { hinweis: string; fuerSchreiber?: string };
    expect(ohne.fuerSchreiber).toBeUndefined();
  });

  it('ab dem 5. Aufruf im Zug fragt das Werkzeug DIP nicht mehr, ein neuer Zug zählt neu', async () => {
    retrieveBundestag.mockResolvedValue({
      results: [{ source: 'bundestag', title: 'Drucksache 21/50', content: 'x' }],
    });
    countBundestagDocs.mockResolvedValue({
      einheit: 'Drucksachen',
      gesamt: 1,
      gruppen: null,
      gruppiertNach: null,
      filters: {},
      notes: [],
      aufrufe: 1,
    });
    const make = () => makeBundestagTool({ state, sourceRegistry: createSourceRegistry() });
    const tool = make();
    for (let i = 0; i < 4; i++) {
      const ok = (await exec(tool, { query: `Klima ${i}` })) as { resultCount: number };
      expect(ok.resultCount).toBe(1);
    }
    const capped = (await exec(tool, { modus: 'zaehlen', query: 'Klima' })) as {
      resultCount: number;
      sources: string;
      hinweis: string;
    };
    expect(capped.resultCount).toBe(0);
    expect(capped.sources).toBe('');
    expect(capped.hinweis).toMatch(/4 Bundestag-Suchen/);
    expect(retrieveBundestag).toHaveBeenCalledTimes(4);
    expect(countBundestagDocs).not.toHaveBeenCalled();
    const refCall = (await exec(tool, { ref: '21/3546' })) as { resultCount: number };
    expect(refCall.resultCount).toBe(0);
    expect(retrieveBundestagFamily).not.toHaveBeenCalled();
    // Neuer Zug = neues Werkzeug = frischer Zähler.
    const fresh = (await exec(make(), { query: 'Klima' })) as { resultCount: number };
    expect(fresh.resultCount).toBe(1);
  });

  it('ohne query und ref sowie bei PlPr-Ref gibt es einen Fehler', async () => {
    const tool = makeBundestagTool({ state, sourceRegistry: createSourceRegistry() });
    expect(((await exec(tool, {})) as { error: string }).error).toMatch(/fehlt/);
    const plpr = (await exec(tool, { ref: 'PlPr 21/80 S. 1-2' })) as { error: string };
    expect(plpr.error).toMatch(/nur für Drucksachen/);
    expect(retrieveBundestagFamily).not.toHaveBeenCalled();
  });
});

describe('parlament_lesen: fokus', () => {
  beforeEach(() => readBundestagRefs.mockReset());
  const doc = {
    ref: '21/1928',
    dokumentnummer: '21/1928',
    drucksachetyp: 'Gesetzentwurf',
    titel: 'T',
    datum: '2025-10-01',
    urheber: [],
    pdfUrl: null,
    textSource: 'dip',
    relevant: true,
    points: [{ aussage: 'a', zitat: 'z z z z', method: 'exact' }],
    droppedPoints: 0,
    windowsRead: 1,
    windowsTotal: 1,
    skipped: null,
    fokusGefunden: true,
  };
  const make = () =>
    makeParlamentLesenTool({
      state: { ...baseState, userLocale: 'de-DE' } as ChatGraphState,
      sourceRegistry: createSourceRegistry(),
    });

  it('reicht den Fokus durch, zeigt ihn auf der Karte und meldet einen fehlenden Anker', async () => {
    readBundestagRefs.mockResolvedValue({
      documents: [doc, { ...doc, ref: '21/2', fokusGefunden: false }],
      notes: [],
    });
    const out = (await exec(make(), {
      quelle: 'bundestag',
      dokumente: ['21/1928', '21/2'],
      frage: 'Was regelt Artikel 3?',
      fokus: 'Artikel 3',
    })) as { hinweise: string[]; uiCard: { fokus: string } };
    expect(readBundestagRefs.mock.calls[0]![0]).toMatchObject({ fokus: 'Artikel 3' });
    expect(out.uiCard.fokus).toBe('Artikel 3');
    expect(out.hinweise).toEqual([
      expect.stringContaining('„Artikel 3“ wurde in BT-Drs. 21/2 nicht gefunden'),
    ]);
  });

  it('ohne Fokus: kein fokus-Argument an den Dienst, kein Kartenfeld', async () => {
    readBundestagRefs.mockResolvedValue({
      documents: [{ ...doc, fokusGefunden: null }],
      notes: [],
    });
    const out = (await exec(make(), {
      quelle: 'bundestag',
      dokumente: ['21/1928'],
      frage: 'Frage?',
    })) as { uiCard: Record<string, unknown>; hinweise?: unknown };
    expect(readBundestagRefs.mock.calls[0]![0]).not.toHaveProperty('fokus');
    expect(out.uiCard).not.toHaveProperty('fokus');
    expect(out.hinweise).toBeUndefined();
  });
});

describe('bundestag_reden: wortlaut', () => {
  beforeEach(() => searchBundestagReden.mockReset());
  const rede = {
    speaker: 'A',
    party: 'GRÜNE',
    date: '2025-05-23',
    excerpt: 'Zeitenwende!',
    protokollNummer: '21/8',
    wahlperiode: 21,
    herausgeber: 'BT',
    topTitle: null,
    score: 1,
  };
  const make = () =>
    makeBundestagRedenTool({ state: baseState, sourceRegistry: createSourceRegistry() });

  it('reicht wortlaut durch, kennzeichnet Ergebnis und Karte', async () => {
    searchBundestagReden.mockResolvedValue({ speeches: [rede], wpFallback: false });
    const out = (await exec(make(), { thema: 'Zeitenwende', wortlaut: true })) as Record<
      string,
      any
    >;
    expect(searchBundestagReden).toHaveBeenCalledWith({ thema: 'Zeitenwende', wortlaut: true });
    expect(out['wortlaut']).toMatch(/wörtlichen Formulierung/);
    expect(out['uiCard'].wortlaut).toBe(true);
  });

  it('ohne wortlaut bleibt der Aufruf wie bisher', async () => {
    searchBundestagReden.mockResolvedValue({ speeches: [rede], wpFallback: false });
    const out = (await exec(make(), { thema: 'Zeitenwende' })) as Record<string, any>;
    expect(searchBundestagReden).toHaveBeenCalledWith({ thema: 'Zeitenwende' });
    expect(out['wortlaut']).toBeUndefined();
    expect(out['uiCard']).not.toHaveProperty('wortlaut');
  });

  it('keine Phrase gefunden: der Fehler sagt, dass die Suche nicht erschöpfend ist', async () => {
    searchBundestagReden.mockResolvedValue({ speeches: [], wpFallback: false });
    const out = (await exec(make(), { thema: 'xyz abc', wortlaut: true })) as { error: string };
    expect(out.error).toContain('nicht erschöpfend');
  });
});

describe('makeAbgeordnetenwatchTool', () => {
  beforeEach(() => retrieveAbgeordnetenwatch.mockReset());

  it('registers results and returns the lean sources shape', async () => {
    retrieveAbgeordnetenwatch.mockResolvedValue([
      {
        source: 'abgeordnetenwatch',
        url: 'https://aw.de/p',
        title: 'Profil',
        content: 'Stimmte dafür.',
      },
    ]);
    const sourceRegistry = createSourceRegistry();
    const out = (await exec(
      makeAbgeordnetenwatchTool({
        state: { ...baseState, intent: 'abgeordnetenwatch' } as ChatGraphState,
        sourceRegistry,
      }),
      { query: 'Habeck' }
    )) as { resultCount: number; sources: string };
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('[1]');
    expect(sourceRegistry.size).toBe(1);
    expect(retrieveAbgeordnetenwatch).toHaveBeenCalledWith('Habeck', 'de-DE');
  });

  it('returns an error result when there are no results', async () => {
    retrieveAbgeordnetenwatch.mockResolvedValue([]);
    const out = (await exec(
      makeAbgeordnetenwatchTool({
        state: { ...baseState, intent: 'abgeordnetenwatch' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'niemand' }
    )) as { error?: string; resultCount: number };
    expect(out.error).toBeTruthy();
    expect(out.resultCount).toBe(0);
  });
});

describe('makeImageTool', () => {
  beforeEach(() => imageNode.mockReset());

  it('injects the prompt, emits image events, returns lean confirmation, and merges the image onto state', async () => {
    const image = {
      base64: 'data:image/jpeg;base64,AAA',
      url: '/uploads/flux/results/x.jpg',
      filename: 'x.jpg',
      prompt: 'Windrad im Sonnenlicht',
      style: 'illustration',
      generationTimeMs: 900,
    };
    imageNode.mockResolvedValue({ generatedImage: image });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'egal' }],
    } as unknown as ChatGraphState;
    const out = (await exec(makeImageTool({ sse: fakeSse(events), state }), {
      prompt: 'Windrad im Sonnenlicht',
    })) as { ok?: boolean; prompt?: string };
    expect(out.ok).toBe(true);
    expect(out.prompt).toBe('Windrad im Sonnenlicht');
    expect(events.map((e) => e.type)).toEqual(['image_start', 'image_complete']);
    // Full image (incl. base64) rides the image_complete event for the live card.
    expect((events[1].payload as { image: { base64: string } }).image.base64).toBe(image.base64);
    // Merged onto shared state so the router can persist it.
    expect((state as unknown as { generatedImage: unknown }).generatedImage).toBe(image);
    // The model's prompt was injected as the trailing user message imageNode reads.
    const passedState = imageNode.mock.calls[0][0] as { messages: { content: string }[] };
    expect(passedState.messages.at(-1)?.content).toBe('Windrad im Sonnenlicht');
  });

  it('is idempotent per turn: a second call does not regenerate (protects the image quota)', async () => {
    const image = {
      base64: 'x',
      url: '/u.jpg',
      filename: 'u.jpg',
      prompt: 'p',
      style: 'realistic',
      generationTimeMs: 1,
    };
    imageNode.mockResolvedValue({ generatedImage: image });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'x' }],
    } as unknown as ChatGraphState;
    const tool = makeImageTool({ sse: fakeSse(events), state });
    await exec(tool, { prompt: 'Windrad' });
    const second = (await exec(tool, { prompt: 'Windrad nochmal' })) as { ok?: boolean };
    expect(second.ok).toBe(true);
    expect(imageNode).toHaveBeenCalledTimes(1); // ← not 2: no second FLUX call / quota burn
    // Only the first call emits image events.
    expect(events.filter((e) => e.type === 'image_start')).toHaveLength(1);
  });

  it('returns an error result (and clears state image) when generation fails', async () => {
    imageNode.mockResolvedValue({ generatedImage: null, error: 'Tageslimit erreicht.' });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'x' }],
    } as unknown as ChatGraphState;
    const out = (await exec(makeImageTool({ sse: fakeSse(events), state }), {
      prompt: 'irgendwas',
    })) as { error?: string; ok?: boolean };
    expect(out.error).toBe('Tageslimit erreicht.');
    expect(out.ok).toBeUndefined();
    expect((state as unknown as { generatedImage: unknown }).generatedImage).toBeNull();
    // image_complete still fires so the progress indicator resolves.
    expect(events.map((e) => e.type)).toEqual(['image_start', 'image_complete']);
  });
});

describe('makeCreateSharepicTool (Phase 3n fat tool)', () => {
  beforeEach(() => runSharepicGeneration.mockReset());

  const VARIANTS = [{ type: 'dreizeiler', imageBase64: 'x', pages: undefined }];

  function makeTool(state: ChatGraphState, events: SseEvent[] = []) {
    return makeCreateSharepicTool({
      sse: fakeSse(events) as Parameters<typeof makeCreateSharepicTool>[0]['sse'],
      state,
      threadId: 't1',
    });
  }

  it('injects the researched text as the trailing user message and returns variants verbatim', async () => {
    runSharepicGeneration.mockResolvedValue({ variants: VARIANTS, failure: null });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'sharepic',
      messages: [{ role: 'user', content: 'Recherchiere X und mach ein Sharepic' }],
      sharepicVariants: null,
    } as unknown as ChatGraphState;

    const out = (await exec(makeTool(state, events), {
      text: 'Tempolimit 130: spart 6,7 Mio. Tonnen CO2 pro Jahr',
    })) as { variants: unknown[]; note: string };

    // The generator reads the LAST message — the model's grounded text must be
    // there, with the original conversation preserved before it.
    const passed = runSharepicGeneration.mock.calls[0][0] as {
      state: { messages: { role: string; content: string }[] };
      threadId: string | null;
    };
    expect(passed.state.messages).toHaveLength(2);
    expect(passed.state.messages[1].content).toContain('Tempolimit 130');
    expect(passed.threadId).toBe('t1');
    // Verbatim variants → persisted step rehydrates the card (toolName 'sharepic').
    expect(out.variants).toEqual(VARIANTS);
    // Shared-ref merge → forceFinish + router lift see the variants.
    expect(state.sharepicVariants).toEqual(VARIANTS);
    expect(events.map((e) => e.type)).toContain('image_start');
  });

  it('is idempotent per turn: a second call never regenerates', async () => {
    runSharepicGeneration.mockResolvedValue({ variants: VARIANTS, failure: null });
    const state = {
      ...baseState,
      messages: [{ role: 'user', content: 'x' }],
      sharepicVariants: null,
    } as unknown as ChatGraphState;
    const tool = makeTool(state);

    await exec(tool, { text: 'a' });
    const second = (await exec(tool, { text: 'völlig anderer text' })) as {
      ok: boolean;
      note: string;
    };
    expect(second.ok).toBe(true);
    expect(second.note).toMatch(/NICHT erneut/);
    expect(runSharepicGeneration).toHaveBeenCalledTimes(1);
  });

  it('failure returns {error} WITHOUT merging state — a retry stays possible', async () => {
    runSharepicGeneration.mockResolvedValueOnce({ variants: [], failure: null });
    runSharepicGeneration.mockResolvedValueOnce({ variants: VARIANTS, failure: null });
    const state = {
      ...baseState,
      messages: [{ role: 'user', content: 'x' }],
      sharepicVariants: null,
    } as unknown as ChatGraphState;
    const tool = makeTool(state);

    const failed = (await exec(tool, { text: 'a' })) as { error: string };
    expect(failed.error).toMatch(/fehlgeschlagen/);
    // Failure must NOT trip the idempotency guard (that would dead-end the turn).
    expect(state.sharepicVariants ?? null).toBeNull();
    const retried = (await exec(tool, { text: 'b' })) as { variants: unknown[] };
    expect(retried.variants).toEqual(VARIANTS);
    expect(runSharepicGeneration).toHaveBeenCalledTimes(2);
  });

  it('pre-existing variants on state (defensive) short-circuit immediately', async () => {
    const state = {
      ...baseState,
      messages: [{ role: 'user', content: 'x' }],
      sharepicVariants: VARIANTS,
    } as unknown as ChatGraphState;
    const out = (await exec(makeTool(state), { text: 'a' })) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(runSharepicGeneration).not.toHaveBeenCalled();
  });
});

describe('makeCreateDocTool (compound presentation/sheet fat tool)', () => {
  beforeEach(() => runDocGeneration.mockReset());

  const DOC = {
    documentId: 'doc-1',
    title: 'Artenschutz – Grüne Positionen',
    subtype: 'presentations' as const,
    url: '/office/doc-1',
  };

  function makeTool(
    kind: 'presentation' | 'sheet' | 'document',
    state: ChatGraphState,
    events: SseEvent[] = []
  ) {
    return makeCreateDocTool({
      kind,
      sse: fakeSse(events) as Parameters<typeof makeCreateDocTool>[0]['sse'],
      state,
      req: {} as Parameters<typeof makeCreateDocTool>[0]['req'],
    });
  }

  const withUser = (over: Partial<ChatGraphState> = {}): ChatGraphState =>
    ({
      ...baseState,
      intent: 'create_presentation',
      agentConfig: { userId: 'u1' },
      createdDocument: null,
      ...over,
    }) as unknown as ChatGraphState;

  it('builds nothing on a turn that ordered an edit to an existing artifact (live 11.10.2026)', async () => {
    const out = (await exec(makeTool('presentation', withUser({ artifactEditOrder: true })), {
      prompt: 'Verkehrswende in Kassel',
    })) as { error?: string };
    expect(out.error).toMatch(/vorhandenes Artefakt/);
    expect(runDocGeneration).not.toHaveBeenCalled();
  });

  it('passes the researched prompt through, emits document_created, merges state, returns the card', async () => {
    runDocGeneration.mockResolvedValue(DOC);
    const events: SseEvent[] = [];
    const state = withUser();

    const out = (await exec(makeTool('presentation', state, events), {
      prompt: 'Artenschutz: Wiedervernässung von Mooren, Flächenstilllegung, [1][2]',
    })) as { document: typeof DOC; note: string };

    const passed = runDocGeneration.mock.calls[0][0] as { kind: string; userContent: string };
    expect(passed.kind).toBe('presentation');
    expect(passed.userContent).toContain('Artenschutz');
    expect(out.document).toEqual(DOC);
    expect(state.createdDocument).toEqual(DOC);
    const created = events.find((e) => e.type === 'document_created');
    expect(created?.payload).toEqual(DOC);
  });

  it('is idempotent per turn: a second call never regenerates', async () => {
    runDocGeneration.mockResolvedValue(DOC);
    const state = withUser();
    const tool = makeTool('presentation', state);

    await exec(tool, { prompt: 'a' });
    const second = (await exec(tool, { prompt: 'völlig anderer auftrag' })) as {
      ok: boolean;
      note: string;
    };
    expect(second.ok).toBe(true);
    expect(second.note).toMatch(/NICHT erneut/);
    expect(runDocGeneration).toHaveBeenCalledTimes(1);
  });

  it('failure returns {error} WITHOUT merging state — a retry stays possible', async () => {
    runDocGeneration.mockResolvedValueOnce(null);
    runDocGeneration.mockResolvedValueOnce(DOC);
    const state = withUser();
    const tool = makeTool('sheet', state);

    const failed = (await exec(tool, { prompt: 'a' })) as { error: string };
    expect(failed.error).toMatch(/fehlgeschlagen/);
    expect(state.createdDocument ?? null).toBeNull();
    const retried = (await exec(tool, { prompt: 'b' })) as { document: typeof DOC };
    expect(retried.document).toEqual(DOC);
    expect(runDocGeneration).toHaveBeenCalledTimes(2);
  });

  it('no user session → {error}, never calls the generator', async () => {
    const state = withUser({ agentConfig: {} as ChatGraphState['agentConfig'] });
    const out = (await exec(makeTool('presentation', state), { prompt: 'a' })) as { error: string };
    expect(out.error).toMatch(/nicht möglich/);
    expect(runDocGeneration).not.toHaveBeenCalled();
  });

  it('kind=document generates a text doc (dynamic subtype) and emits the card', async () => {
    const TEXTDOC = {
      documentId: 'd9',
      title: 'Positionspapier Artenschutz',
      subtype: 'docs',
      url: '/office/d9',
    };
    runDocGeneration.mockResolvedValue(TEXTDOC);
    const events: SseEvent[] = [];
    const state = withUser({ intent: 'agentic' });
    const out = (await exec(makeTool('document', state, events), {
      prompt: 'Positionspapier zum Artenschutz mit den recherchierten Fakten',
    })) as { document: typeof TEXTDOC };
    expect((runDocGeneration.mock.calls[0][0] as { kind: string }).kind).toBe('document');
    expect(out.document).toEqual(TEXTDOC);
    expect(state.createdDocument).toEqual(TEXTDOC);
    expect(events.find((e) => e.type === 'document_created')?.payload).toEqual(TEXTDOC);
  });
});

describe('makeCreateBoardTool (compound board fat tool)', () => {
  beforeEach(() => runBoardGeneration.mockReset());

  const BOARD = {
    boardId: 'b1',
    title: 'Artenschutz-Maßnahmen',
    boardGeneratedStructure: { rows: [] },
  };

  const withUser = (over: Partial<ChatGraphState> = {}): ChatGraphState =>
    ({
      ...baseState,
      intent: 'agentic',
      agentConfig: { userId: 'u1' },
      createdBoard: null,
      ...over,
    }) as unknown as ChatGraphState;

  function makeTool(state: ChatGraphState) {
    return makeCreateBoardTool({
      state,
      req: {} as Parameters<typeof makeCreateBoardTool>[0]['req'],
    });
  }

  it('creates the board, stashes state.createdBoard, returns id + link note (NO document_created)', async () => {
    runBoardGeneration.mockResolvedValue(BOARD);
    const state = withUser();
    const out = (await exec(makeTool(state), { prompt: 'Aufgaben zum Artenschutz' })) as {
      board: { boardId: string };
      note: string;
    };
    expect(out.board.boardId).toBe('b1');
    expect(out.note).toMatch(/boards\/b1/);
    // Shared-ref merge for the router's done-event lift.
    expect(state.createdBoard).toEqual(BOARD);
  });

  it('is idempotent per turn: a second call never regenerates', async () => {
    runBoardGeneration.mockResolvedValue(BOARD);
    const state = withUser();
    const tool = makeTool(state);
    await exec(tool, { prompt: 'a' });
    const second = (await exec(tool, { prompt: 'anders' })) as { ok: boolean; note: string };
    expect(second.ok).toBe(true);
    expect(second.note).toMatch(/NICHT erneut/);
    expect(runBoardGeneration).toHaveBeenCalledTimes(1);
  });

  it('failure returns {error} WITHOUT merging state — retry stays possible', async () => {
    runBoardGeneration.mockResolvedValueOnce(null);
    runBoardGeneration.mockResolvedValueOnce(BOARD);
    const state = withUser();
    const tool = makeTool(state);
    const failed = (await exec(tool, { prompt: 'a' })) as { error: string };
    expect(failed.error).toMatch(/fehlgeschlagen/);
    expect(state.createdBoard ?? null).toBeNull();
    const retried = (await exec(tool, { prompt: 'b' })) as { board: { boardId: string } };
    expect(retried.board.boardId).toBe('b1');
  });

  it('no user session → {error}, never calls the generator', async () => {
    const state = withUser({ agentConfig: {} as ChatGraphState['agentConfig'] });
    const out = (await exec(makeTool(state), { prompt: 'a' })) as { error: string };
    expect(out.error).toMatch(/nicht möglich/);
    expect(runBoardGeneration).not.toHaveBeenCalled();
  });
});

/**
 * The artifact generator is a separate model call: it sees the brief the
 * planner typed, and nothing else. Whatever the thread agreed on is invisible
 * to it unless we thread it through.
 *
 * QA, 28.07.2026: three heat-protection measures were fixed in the chat, then
 * "mach ein PDF draus" produced a dossier that kept one and replaced the other
 * two with generic measures the generator knew on its own. It was not a
 * hallucination — nobody had shown it the list. The single-pass create turns
 * got this transcript in #2136; these tests pin the loop's half.
 */
describe('artifact briefs carry the conversation', () => {
  beforeEach(() => {
    runDocGeneration.mockReset();
    runBoardGeneration.mockReset();
  });

  const THREE_MEASURES =
    'Maßnahme 1: Cooling Zones. Maßnahme 2: Öffnung kühler Orte. Maßnahme 3: klimatisierter ÖPNV.';

  const stateWith = (messages: unknown[], over: Partial<ChatGraphState> = {}): ChatGraphState =>
    ({
      ...baseState,
      agentConfig: { userId: 'u1' },
      createdDocument: null,
      createdBoard: null,
      messages,
      ...over,
    }) as unknown as ChatGraphState;

  it('hands the generator what the thread agreed on, not just the planner’s retyped order', async () => {
    runDocGeneration.mockResolvedValue({
      documentId: 'd1',
      title: 'Dossier',
      subtype: 'documents' as const,
      url: '/office/d1',
    });
    const state = stateWith([
      { role: 'user', content: 'Recherchiere drei Hitzeschutzmaßnahmen.' },
      { role: 'assistant', content: THREE_MEASURES },
      { role: 'user', content: 'Mach ein PDF draus' },
    ]);

    await exec(
      makeCreateDocTool({
        kind: 'document',
        sse: fakeSse([]) as Parameters<typeof makeCreateDocTool>[0]['sse'],
        state,
        req: {} as Parameters<typeof makeCreateDocTool>[0]['req'],
      }),
      { prompt: 'Dossier zum Hitzeschutz' }
    );

    const brief = (runDocGeneration.mock.calls[0]?.[0] as { userContent: string }).userContent;
    expect(brief).toContain('Cooling Zones');
    expect(brief).toContain('klimatisierter ÖPNV');
    // The planner's order must still be the instruction, so it comes LAST.
    expect(brief.indexOf('AUFTRAG:')).toBeGreaterThan(brief.indexOf('Cooling Zones'));
  });

  it('keeps the sources block alongside the transcript', async () => {
    runDocGeneration.mockResolvedValue({
      documentId: 'd2',
      title: 'T',
      subtype: 'sheets' as const,
      url: '/office/d2',
    });
    const registry = createSourceRegistry();
    registry.register([
      {
        source: 'documents',
        title: 'Hitzeaktionsplan',
        url: 'https://example.at/hap',
        content: 'Cooling Zones …',
      },
    ]);
    const state = stateWith([
      { role: 'user', content: 'Was steht im Hitzeaktionsplan?' },
      { role: 'assistant', content: THREE_MEASURES },
      { role: 'user', content: 'Als Tabelle bitte' },
    ]);

    await exec(
      makeCreateDocTool({
        kind: 'sheet',
        sse: fakeSse([]) as Parameters<typeof makeCreateDocTool>[0]['sse'],
        state,
        req: {} as Parameters<typeof makeCreateDocTool>[0]['req'],
        sourceRegistry: registry,
      }),
      { prompt: 'Vergleichstabelle' }
    );

    const brief = (runDocGeneration.mock.calls[0]?.[0] as { userContent: string }).userContent;
    expect(brief).toContain('Cooling Zones');
    expect(brief).toContain('https://example.at/hap');
  });

  it('leaves a first-turn brief untouched', async () => {
    // Nothing was agreed yet, so there is no background to prepend — the brief
    // must stay exactly what the planner asked for.
    runDocGeneration.mockResolvedValue({
      documentId: 'd3',
      title: 'T',
      subtype: 'documents' as const,
      url: '/office/d3',
    });
    const state = stateWith([{ role: 'user', content: 'Schreib ein Konzept zu Tempo 30' }]);

    await exec(
      makeCreateDocTool({
        kind: 'document',
        sse: fakeSse([]) as Parameters<typeof makeCreateDocTool>[0]['sse'],
        state,
        req: {} as Parameters<typeof makeCreateDocTool>[0]['req'],
      }),
      { prompt: 'Konzept Tempo 30' }
    );

    const brief = (runDocGeneration.mock.calls[0]?.[0] as { userContent: string }).userContent;
    expect(brief).toBe('Konzept Tempo 30');
  });

  it('briefs the board generator the same way', async () => {
    runBoardGeneration.mockResolvedValue({ boardId: 'b1', structure: {} });
    const state = stateWith([
      { role: 'user', content: 'Welche Schritte braucht die Kampagne?' },
      { role: 'assistant', content: THREE_MEASURES },
      { role: 'user', content: 'Mach ein Board draus' },
    ]);

    await exec(
      makeCreateBoardTool({
        state,
        req: {} as Parameters<typeof makeCreateBoardTool>[0]['req'],
      }),
      { prompt: 'Board zur Kampagne' }
    );

    const brief = (runBoardGeneration.mock.calls[0]?.[0] as { userContent: string }).userContent;
    expect(brief).toContain('Cooling Zones');
  });
});
