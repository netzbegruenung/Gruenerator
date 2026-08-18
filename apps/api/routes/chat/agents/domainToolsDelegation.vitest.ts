import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Was `domainTools.vitest.ts` NICHT prüfen kann: dass die beiden
 * Parlaments-Werkzeuge ihren Dienst überhaupt erreichen.
 *
 * Dort ist `searchNode` modulweit attrappiert — geprüft wird die Verdrahtung
 * (Schnipselkappe, schlanke Rückgabeform), nicht die Auslieferung. Die Lücke ist
 * gemessen: entfernt man die beiden `case`-Zweige aus `searchNode`, bleiben
 * jene 44 Tests grün, während der Loop-Pfad still 0 Treffer liefert — der
 * `default`-Zweig loggt eine Warnung und gibt ein leeres Ergebnis zurück.
 *
 * Diese Datei fährt deshalb den ECHTEN Knoten und attrappiert eine Ebene
 * tiefer, an den Anreicherungs-Diensten. Sie ist die Zusicherung, dass der
 * Kern erreicht wird — und damit das Netz unter jeder späteren Umlegung der
 * Türen.
 */

const btSearch = vi.fn<(q: string) => Promise<unknown>>();
const awSearch = vi.fn<(q: string) => Promise<unknown>>();

vi.mock('../../../services/bundestag/BundestagEnrichedService.js', () => ({
  getBundestagEnrichedService: () => ({ search: (q: string) => btSearch(q) }),
}));
vi.mock('../../../services/abgeordnetenwatch/index.js', () => ({
  getEnrichedPoliticianService: () => ({ search: (q: string) => awSearch(q) }),
}));

const { makeBundestagTool, makeAbgeordnetenwatchTool } = await import('./domainTools.js');

function exec(tool: unknown, input: unknown): Promise<unknown> {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

function stateWith(extra: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'search',
    searchQuery: null,
    userLocale: 'de-DE',
    documentIds: [],
    documentChatIds: [],
    messages: [{ role: 'user', content: 'Was steht dazu im Bundestag?' }],
    ...extra,
  } as unknown as ChatGraphState;
}

const DRUCKSACHE = {
  kind: 'document' as const,
  document: {
    drucksache: {
      dokumentnummer: '21/123',
      titel: 'Antrag Wärmepumpenförderung',
      datum: '2026-01-01',
      urheber: ['BÜNDNIS 90/DIE GRÜNEN'],
      drucksachetyp: 'Antrag',
      pdfUrl: 'https://dip.bundestag.de/x.pdf',
    },
    siblings: [],
    vorgang: null,
  },
  notes: [],
  metadata: {
    query: 'Wärmepumpe',
    extractedName: null,
    matchedDokumentnummer: '21/123',
    fetchTimeMs: 1,
  },
};

const MANDAT = {
  kind: 'person' as const,
  person: {
    politician: { id: 1, name: 'Beispiel Person', party: 'GRÜNE', profileUrl: null },
    mandate: {
      mandateId: 1,
      politicianId: 1,
      politicianName: 'Beispiel Person',
      parliamentPeriod: 'Bundestag 2025 - 2029',
      fraction: 'BÜNDNIS 90/DIE GRÜNEN',
    },
    recentVotes: [],
    topicVotes: [],
    sideJobs: [],
  },
  notes: [],
  metadata: { query: 'Beispiel', extractedName: 'Beispiel Person', fetchTimeMs: 1 },
};

describe('Parlaments-Werkzeuge erreichen ihren Dienst', () => {
  beforeEach(() => {
    btSearch.mockReset();
    awSearch.mockReset();
  });

  it('das Bundestags-Werkzeug fragt die DIP und meldet ihre Treffer', async () => {
    btSearch.mockResolvedValue(DRUCKSACHE);

    const out = (await exec(
      makeBundestagTool({ state: stateWith(), sourceRegistry: createSourceRegistry() }),
      { query: 'Wärmepumpe' }
    )) as { resultCount: number; sources: string; error?: string };

    expect(btSearch).toHaveBeenCalledWith('Wärmepumpe');
    expect(out.error).toBeUndefined();
    expect(out.resultCount).toBeGreaterThan(0);
    expect(out.sources).toContain('Drucksache 21/123');
  });

  it('das Abgeordnetenwatch-Werkzeug fragt seinen Dienst und meldet dessen Treffer', async () => {
    awSearch.mockResolvedValue(MANDAT);

    const out = (await exec(
      makeAbgeordnetenwatchTool({ state: stateWith(), sourceRegistry: createSourceRegistry() }),
      { query: 'Beispiel Person' }
    )) as { resultCount: number; sources: string; error?: string };

    expect(awSearch).toHaveBeenCalledWith('Beispiel Person');
    expect(out.error).toBeUndefined();
    expect(out.resultCount).toBeGreaterThan(0);
    expect(out.sources).toContain('Beispiel Person');
  });

  it('die Mehrdokument-Auffächerung kapert den Abruf nicht mehr', async () => {
    // Der Regress, gegen den der Kern gezogen wurde: das Werkzeug rief
    // `searchNode` mit gesetztem Intent erneut auf und nahm dessen Vorrede mit.
    // Die Auffächerung kehrt VOR dem `switch` zurück, sobald der Turn zwei
    // abrufbare Dokumentquellen trägt — gemessen fragte ein `@bundestag` die
    // DIP dann NIE (`dipCalled=0`) und lieferte Dokumenttreffer unter dem Namen
    // des Bundestags-Werkzeugs zurück.
    btSearch.mockResolvedValue(DRUCKSACHE);

    const out = (await exec(
      makeBundestagTool({
        state: stateWith({
          documentSources: [
            { kind: 'document', id: 'aaaaaaaa-1111' },
            { kind: 'document', id: 'bbbbbbbb-2222' },
          ],
        } as Partial<ChatGraphState>),
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Wärmepumpe' }
    )) as { resultCount: number; sources: string };

    expect(btSearch).toHaveBeenCalledWith('Wärmepumpe');
    expect(out.resultCount).toBeGreaterThan(0);
    expect(out.sources).toContain('Drucksache 21/123');
  });

  it('für de-AT kommt die begründete Absage statt leerer Daten', async () => {
    btSearch.mockResolvedValue(DRUCKSACHE);

    const out = (await exec(
      makeBundestagTool({
        state: stateWith({ userLocale: 'de-AT' } as Partial<ChatGraphState>),
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'Wärmepumpe' }
    )) as { resultCount: number; sources: string };

    expect(btSearch).not.toHaveBeenCalled();
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('Nur für Deutschland');
  });

  it('eine Fehlanzeige der DIP reist als ausdrücklicher Eintrag mit', async () => {
    // `standalone` in `buildBundestagResults`: ist die DIP der ganze Turn, IST
    // das ausdrückliche \u201enichts gefunden\u201c die Antwort und muss das Modell
    // erreichen \u2014 sonst erfindet es eine. Der Zweig ist damit kein Fehlerfall,
    // und genau deshalb steht er hier fest.
    btSearch.mockResolvedValue({
      kind: 'none',
      notes: [],
      metadata: {
        query: 'x',
        extractedName: null,
        matchedDokumentnummer: null,
        fetchTimeMs: 1,
      },
    });

    const out = (await exec(
      makeBundestagTool({ state: stateWith(), sourceRegistry: createSourceRegistry() }),
      { query: 'x' }
    )) as { resultCount: number; sources: string; error?: string };

    expect(btSearch).toHaveBeenCalled();
    expect(out.resultCount).toBe(1);
    expect(out.error).toBeUndefined();
  });
});
