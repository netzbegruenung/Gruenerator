/**
 * Fehleingabe-Matrix: je repariertem Fehlerpfad eine Zeile — Eingabe oder
 * Ausfall, dann erwartete `fehlerArt`, Ursache und (wo vorgesehen) nächster
 * Schritt. Die Dienste sind gemockt, es läuft nichts gegen ein Netz.
 *
 * Die Zeilen für `scrape_url`, `documents` und `boards_tasks` stehen bei ihren
 * Werkzeugen (`toolCatalog.vitest.ts`, `personalDataTools.vitest.ts`): deren
 * Mock-Gerüst ist dort schon da.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  FEHLER_ARTEN,
  klassifiziereWurf,
  leeresErgebnis,
  werkzeugFehler,
  type FehlerArt,
} from './toolFailure.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const executeDirectSearch = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const executeDirectWebSearch = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('./directSearch.js', () => ({
  executeDirectSearch: (...a: unknown[]) => executeDirectSearch(...a),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectPressemitteilungExamples: vi.fn(),
  executeDirectWebSearch: (...a: unknown[]) => executeDirectWebSearch(...a),
}));
const lookupUmfragen = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('../../../services/monitor/UmfragenService.js', () => ({
  lookupUmfragen: (...a: unknown[]) => lookupUmfragen(...a),
}));
const retrieveAbgeordnetenwatch = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  retrieveBundestagFamily: vi.fn(),
  retrieveBundestag: vi.fn(),
  retrieveAbgeordnetenwatch: (...a: unknown[]) => retrieveAbgeordnetenwatch(...a),
}));
const runSharepicGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
const runDocGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
const runBoardGeneration = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../services/intentExecutionService.js', () => ({
  runSharepicGeneration: (o: unknown) => runSharepicGeneration(o),
  runDocGeneration: (o: unknown) => runDocGeneration(o),
  runBoardGeneration: (o: unknown) => runBoardGeneration(o),
}));

const { createSearchTools } = await import('./searchTools.js');
const {
  makeAbgeordnetenwatchTool,
  makeCreateBoardTool,
  makeCreateDocTool,
  makeCreateSharepicTool,
  makeUmfragenTool,
} = await import('./domainTools.js');

type Out = {
  error?: string;
  fehlerArt?: FehlerArt;
  naechsterSchritt?: string;
  hinweis?: string;
  message?: string;
};

function exec(tool: unknown, input: unknown): Promise<Out> {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<Out> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

const AGENT = {
  identifier: 'gruenerator-universal',
  provider: 'mistral',
  model: 'mistral-medium-2604',
  params: {},
} as never;

const state = (over: Record<string, unknown> = {}) =>
  ({
    intent: 'search',
    userLocale: 'de-DE',
    messages: [{ role: 'user', content: 'x' }],
    agentConfig: { userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

const sse = { send: () => {} } as never;

describe('werkzeugFehler / leeresErgebnis', () => {
  it('error = Ursache + Befund, der nächste Schritt steht getrennt', () => {
    const f = werkzeugFehler({
      art: 'nicht_gefunden',
      ursache: 'Weg',
      befund: 'Gesucht: X',
      naechsterSchritt: 'Prüfe X.',
    });
    // Der nächste Schritt gehört nicht in `error`: das zeigt die Karte der Person.
    expect(f).toEqual({
      error: 'Weg. Gesucht: X.',
      fehlerArt: 'nicht_gefunden',
      naechsterSchritt: 'Prüfe X.',
    });
  });

  it('lässt fehlende Teile weg, nie ein leeres error', () => {
    expect(werkzeugFehler({ art: 'teilweise', ursache: 'Nur Teil' }).error).toBe('Nur Teil.');
    expect(werkzeugFehler({ art: 'teilweise', ursache: 'A', befund: '  ' }).error).toBe('A.');
  });

  it('kennt genau die vereinbarten Fehlerarten', () => {
    expect([...FEHLER_ARTEN]).toEqual([
      'nicht_gefunden',
      'ungueltige_eingabe',
      'anbieter_ausfall',
      'zeitlimit',
      'keine_berechtigung',
      'nicht_verfuegbar',
      'teilweise',
    ]);
  });

  it('echtes Leer: resultCount 0, kein error, nennt die Filter', () => {
    const leer = leeresErgebnis({ filter: 'Zeitraum week', hinweis: 'Lockere den Zeitraum' });
    expect(leer.resultCount).toBe(0);
    expect(leer).not.toHaveProperty('error');
    expect(leer.hinweis).toMatch(/Zeitraum week/);
    expect(leer.hinweis).toMatch(/Lockere den Zeitraum/);
  });
});

describe('klassifiziereWurf (wrapTools)', () => {
  type Row = [
    string,
    unknown,
    { timedOut?: boolean; timeoutMs?: number },
    FehlerArt,
    RegExp,
    RegExp | null,
  ];
  const rows: Row[] = [
    [
      'Zeitüberschreitung',
      new Error('Zeitüberschreitung nach 20000ms'),
      { timedOut: true, timeoutMs: 20000 },
      'zeitlimit',
      /Zeitüberschreitung nach 20 s.*verworfen/,
      /einmaliger neuer Versuch.*nichts mehr an/,
    ],
    [
      'HTTP 401',
      new Error('Request failed with status code 401'),
      {},
      'keine_berechtigung',
      /Zugriff.*abgelehnt/,
      /Nicht erneut versuchen/,
    ],
    [
      'HTTP 403',
      new Error('HTTP 403 Forbidden'),
      {},
      'keine_berechtigung',
      /Zugriff.*abgelehnt/,
      /Nicht erneut versuchen/,
    ],
    [
      'HTTP 404',
      new Error('Request failed with status code 404'),
      {},
      'nicht_gefunden',
      /gibt es dort nicht/,
      /Prüfe die Angabe/,
    ],
    [
      'HTTP 429',
      new Error('Request failed with status code 429'),
      {},
      'anbieter_ausfall',
      /Limit/,
      /Später erneut/,
    ],
    [
      'HTTP 500',
      new Error('Request failed with status code 500'),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      /einziger neuer Versuch/,
    ],
    [
      'HTTP 503 im Text',
      new Error('upstream: HTTP 503'),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      /einziger neuer Versuch/,
    ],
    [
      'status-Feld',
      Object.assign(new Error('boom'), { status: 502 }),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      null,
    ],
    [
      'response.status',
      Object.assign(new Error('boom'), { response: { status: 404 } }),
      {},
      'nicht_gefunden',
      /gibt es dort nicht/,
      null,
    ],
    [
      'Wurf ohne Error mit status',
      { status: 429, body: 'slow down' },
      {},
      'anbieter_ausfall',
      /Limit/,
      null,
    ],
    [
      'cause.code ECONNRESET',
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      /einziger neuer Versuch/,
    ],
    [
      'ETIMEDOUT im Text',
      new Error('connect ETIMEDOUT 1.2.3.4:443'),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      null,
    ],
    ['fetch failed', new Error('fetch failed'), {}, 'anbieter_ausfall', /nicht erreichbar/, null],
    [
      'unbekannt',
      new Error('kaputt wie nie'),
      {},
      'nicht_verfuegbar',
      /abgebrochen.*kaputt wie nie/,
      null,
    ],
    // Negativzeilen: nackte Zahlen sind kein Status.
    [
      'Pfad /items/404 + status 503',
      new Error('GET /items/404 failed with status 503'),
      {},
      'anbieter_ausfall',
      /nicht erreichbar/,
      null,
    ],
    [
      '"maximal 500 Zeichen"',
      new Error('Der Text darf maximal 500 Zeichen haben'),
      {},
      'nicht_verfuegbar',
      /abgebrochen.*500 Zeichen/,
      null,
    ],
    [
      'URL mit /429/',
      new Error('Ungültige Quelle https://example.org/429/seite'),
      {},
      'nicht_verfuegbar',
      /abgebrochen/,
      null,
    ],
    [
      '"network" als Wort',
      new Error('Das Netzwerk-Notebook "network" ist leer'),
      {},
      'nicht_verfuegbar',
      /abgebrochen/,
      null,
    ],
  ];
  it.each(rows)('%s', (_name, err, opts, art, ursache, schritt) => {
    const f = klassifiziereWurf(err, opts);
    expect(f.fehlerArt).toBe(art);
    expect(f.error).toMatch(ursache);
    if (schritt) expect(f.naechsterSchritt).toMatch(schritt);
  });

  it('error enthält nie eine Anweisung ans Modell (Karte der Person)', () => {
    for (const [, err, opts] of rows) {
      const f = klassifiziereWurf(err, opts);
      expect(f.error).not.toMatch(/Nicht erneut|erneut versuchen|Prüfe|nenne|sag /i);
    }
  });

  it('Zeitüberschreitung verspricht nichts Nachgeliefertes', () => {
    const f = klassifiziereWurf(new Error('x'), { timedOut: true, timeoutMs: 20000 });
    expect(`${f.error} ${f.naechsterSchritt}`).not.toMatch(/nachliefer|noch weiter/);
  });

  it('behält die Originalmeldung als Befund', () => {
    expect(klassifiziereWurf(new Error('status code 404')).error).toContain('status code 404');
  });

  it('Nicht-Error-Würfe werden nicht zu [object Object]', () => {
    const f = klassifiziereWurf({ foo: 'bar' });
    expect(f.error).toContain('{"foo":"bar"}');
    expect(f.error).not.toContain('[object Object]');
    expect(klassifiziereWurf('nur Text').error).toContain('nur Text');
  });

  it('leere Meldung ergibt trotzdem ein gefülltes error', () => {
    expect(klassifiziereWurf(new Error('')).error).not.toBe('');
  });
});

describe('gruenerator_search', () => {
  beforeEach(() => {
    executeDirectSearch.mockReset();
  });
  const tool = () =>
    createSearchTools(AGENT, { userLocale: 'de-DE' }).gruenerator_search as unknown;

  const rows: Array<
    [string, () => void, Record<string, unknown>, FehlerArt | null, RegExp, RegExp | null]
  > = [
    [
      'unbekannte Sammlung',
      () => {},
      { query: 'q', collection: 'gibt-es-nicht', limit: 5 },
      'nicht_verfuegbar',
      /„gibt-es-nicht“ steht hier nicht zur Verfügung.*Verfügbar sind/,
      /Wähle eine davon/,
    ],
    [
      'Backend-Ausfall (error: true)',
      () =>
        executeDirectSearch.mockResolvedValue({
          collection: 'deutschland',
          query: 'q',
          searchMode: 'hybrid',
          resultsCount: 0,
          results: [],
          error: true,
          message: 'Die Dokumentsuche ist momentan gestört — es konnte nicht gesucht werden.',
        }),
      { query: 'q', collection: 'deutschland', limit: 5 },
      'anbieter_ausfall',
      /momentan gestört/,
      /nicht, dass es dazu keine Inhalte gibt/,
    ],
    [
      'Wurf im Executor',
      () => executeDirectSearch.mockRejectedValue(new Error('qdrant weg')),
      { query: 'q', collection: 'deutschland', limit: 5 },
      'anbieter_ausfall',
      /Suche ist abgebrochen.*qdrant weg/,
      /höchstens einmal erneut/,
    ],
  ];
  it.each(rows)('%s', async (_n, arrange, input, art, ursache, schritt) => {
    arrange();
    const out = await exec(tool(), input);
    expect(out.fehlerArt).toBe(art);
    expect(out.error).toMatch(ursache);
    if (schritt) expect(out.naechsterSchritt).toMatch(schritt);
  });

  it('echtes Leer bleibt ein Nicht-Fehler und nennt Sammlung', async () => {
    executeDirectSearch.mockResolvedValue({
      collection: 'deutschland',
      query: 'q',
      searchMode: 'hybrid',
      resultsCount: 0,
      results: [],
      message: 'Keine Ergebnisse gefunden.',
    });
    const out = await exec(tool(), { query: 'q', collection: 'deutschland', limit: 5 });
    expect(out.error).toBeUndefined();
    expect(out.message).toMatch(/Sammlung deutschland/);
  });
});

describe('web_search', () => {
  beforeEach(() => {
    executeDirectWebSearch.mockReset();
  });
  const tool = (userText?: string) =>
    createSearchTools(AGENT, { userLocale: 'de-DE', ...(userText ? { userText } : {}) })
      .web_search as unknown;
  const ok0 = { query: 'q', searchType: 'general', tier: 'standard', resultsCount: 0, results: [] };

  it('Ausfall (error: true) ⇒ Text mit Ursache und nächstem Schritt', async () => {
    executeDirectWebSearch.mockResolvedValue({
      ...ok0,
      error: true,
      message: 'Websuche fehlgeschlagen: 502',
    });
    const out = await exec(tool(), { query: 'q', searchType: 'general', tiefe: 'standard' });
    expect(out.fehlerArt).toBe('anbieter_ausfall');
    expect(out.error).toMatch(/Websuche fehlgeschlagen: 502/);
    expect(out.naechsterSchritt).toMatch(/höchstens einmal erneut/);
  });

  it('Wurf ⇒ anbieter_ausfall mit Originalmeldung', async () => {
    executeDirectWebSearch.mockRejectedValue(new Error('linkup 500'));
    const out = await exec(tool(), { query: 'q', searchType: 'general', tiefe: 'standard' });
    expect(out.fehlerArt).toBe('anbieter_ausfall');
    expect(out.error).toMatch(/linkup 500/);
  });

  it('leer mit Zeitraum und genannter Seite ⇒ nennt beide und rät zum Lockern', async () => {
    executeDirectWebSearch.mockResolvedValue({
      ...ok0,
      message: 'Keine Websuche-Ergebnisse gefunden.',
    });
    const out = await exec(tool('suche auf zeit.de'), {
      query: 'q',
      searchType: 'general',
      tiefe: 'standard',
      zeitraum: 'week',
      seiten: ['zeit.de'],
    });
    expect(out.error).toBeUndefined();
    expect(out.message).toMatch(/Zeitraum week.*nur auf zeit\.de.*Lockere zuerst/);
  });

  it('verworfene Seitenvorgabe wird auch bei Treffern gemeldet', async () => {
    executeDirectWebSearch.mockResolvedValue({ ...ok0, resultsCount: 1, results: [{ rank: 1 }] });
    const out = await exec(tool('suche nach Solar'), {
      query: 'q',
      searchType: 'general',
      tiefe: 'standard',
      seiten: ['spiegel.de'],
    });
    expect(out.hinweis).toMatch(/spiegel\.de wurde nicht angewandt/);
  });
});

describe('umfragen', () => {
  beforeEach(() => {
    lookupUmfragen.mockReset();
  });
  const make = () =>
    makeUmfragenTool({ sourceRegistry: createSourceRegistry(), state: state() }) as unknown;

  it('Ausfall (Wurf) ⇒ anbieter_ausfall, keine Zahlen aus dem Gedächtnis', async () => {
    lookupUmfragen.mockRejectedValue(new Error('politpro down'));
    const out = await exec(make(), { topic: '', bundesland: 'Bayern' });
    expect(out.fehlerArt).toBe('anbieter_ausfall');
    expect(out.error).toMatch(/nicht erreichbar.*Region „Bayern“/);
    expect(out.naechsterSchritt).toMatch(/keine Zahlen aus dem Gedächtnis/);
  });

  it('keine Daten (null) ⇒ nicht_gefunden mit Filter und Vorschlag', async () => {
    lookupUmfragen.mockResolvedValue(null);
    const out = await exec(make(), { topic: 'Klima', bundesland: 'Atlantis' });
    expect(out.fehlerArt).toBe('nicht_gefunden');
    expect(out.error).toMatch(/keine Werte.*Atlantis.*Klima/);
    expect(out.naechsterSchritt).toMatch(/ohne Thema oder ohne Region/);
  });
});

describe('abgeordnetenwatch', () => {
  beforeEach(() => {
    retrieveAbgeordnetenwatch.mockReset();
  });
  const make = (locale: string) =>
    makeAbgeordnetenwatchTool({
      sourceRegistry: createSourceRegistry(),
      state: state({ userLocale: locale }),
    }) as unknown;

  it('AT ⇒ Fehler statt zitierbarem Treffer, Dienst wird nicht gerufen', async () => {
    const out = await exec(make('de-AT'), { query: 'Habeck' });
    expect(out.fehlerArt).toBe('nicht_verfuegbar');
    expect(out.error).toMatch(/nur für Deutschland/);
    expect(retrieveAbgeordnetenwatch).not.toHaveBeenCalled();
  });

  it('Wurf ⇒ anbieter_ausfall statt rohem Wurf', async () => {
    retrieveAbgeordnetenwatch.mockRejectedValue(new Error('aw 500'));
    const out = await exec(make('de-DE'), { query: 'Habeck' });
    expect(out.fehlerArt).toBe('anbieter_ausfall');
    expect(out.error).toMatch(/nicht erreichbar.*„Habeck“/);
  });

  it('kein Treffer ⇒ nicht_gefunden mit Schreibweisen-Tipp', async () => {
    retrieveAbgeordnetenwatch.mockResolvedValue([]);
    const out = await exec(make('de-DE'), { query: 'Nobody' });
    expect(out.fehlerArt).toBe('nicht_gefunden');
    expect(out.error).toMatch(/„Nobody“/);
    expect(out.naechsterSchritt).toMatch(/Schreibweise/);
  });
});

describe('Erstellen schlägt fehl', () => {
  beforeEach(() => {
    runSharepicGeneration.mockReset();
    runDocGeneration.mockReset();
    runBoardGeneration.mockReset();
  });

  const nichtDoppelt = /höchstens einmal erneut.*nichts doppelt/;

  it('create_document: Grund unbekannt ⇒ sagt das, rät nicht doppelt anzulegen', async () => {
    runDocGeneration.mockResolvedValue(null);
    const tool = makeCreateDocTool({ kind: 'document', sse, state: state(), req: {} as never });
    const out = await exec(tool, { prompt: 'x' });
    expect(out.fehlerArt).toBe('nicht_verfuegbar');
    expect(out.error).toMatch(/Dokument-Erstellung fehlgeschlagen.*Grund ist nicht bekannt/);
    expect(out.naechsterSchritt).toMatch(nichtDoppelt);
  });

  it('sharepic: bekannter Grund wird durchgereicht', async () => {
    runSharepicGeneration.mockResolvedValue({ variants: [], failure: 'carousel_slide_count' });
    const tool = makeCreateSharepicTool({ sse, state: state(), threadId: 't1' } as never);
    const out = await exec(tool, { text: 'x' });
    expect(out.error).toMatch(/Sharepic-Erstellung fehlgeschlagen/);
    expect(out.error).toMatch(/Karussell/);
    expect(out.error).not.toMatch(/Grund ist nicht bekannt/);
    // Bekannter Grund: kein Retry-Satz, die Person entscheidet.
    expect(out.naechsterSchritt).not.toMatch(/erneut/);
    expect(out.naechsterSchritt).toMatch(/Wahl/);
  });

  it('create_board: ohne Grund ⇒ Grund unbekannt', async () => {
    runBoardGeneration.mockResolvedValue(null);
    const tool = makeCreateBoardTool({ sse, state: state(), req: {} as never } as never);
    const out = await exec(tool, { prompt: 'x' });
    expect(out.error).toMatch(/Board-Erstellung fehlgeschlagen.*Grund ist nicht bekannt/);
  });
});
