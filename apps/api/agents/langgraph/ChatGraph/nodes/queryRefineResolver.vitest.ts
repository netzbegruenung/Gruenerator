import { describe, it, expect, vi } from 'vitest';

import { classifierNode } from './classifierNode.js';
import { refineSearchQuery } from './queryRefineResolver.js';

import type { AiClient } from '../../../../services/ai/types.js';
import type { ChatGraphState } from '../types.js';

/**
 * Der Auflöser, der die Suchanfrage für erzwungene Suchen formuliert — und der
 * einzige der Reihe, der bis hierher gar keinen eigenen Test hatte. Abgedeckt
 * war nur `extractSearchTopic`, also sein FALLBACK: jede Zusicherung galt dem
 * Verhalten, das gilt, wenn der Auflöser nicht funktioniert.
 *
 * Was hier geprüft wird, ist die Arbeitsteilung, auf der fünf Aufrufstellen
 * stehen (@dokumentchat, @document, @wolke, @connect, @notebook):
 *
 *   Der Auflöser liefert eine Anfrage — oder `null`.
 *   `null` heisst „nimm die Heuristik", nie „suche nach nichts".
 *
 * Der zweite Teil ist der gefährlichere. Eine leere oder nutzlose Anfrage wäre
 * keine Ausnahme, sondern eine stille Verschlechterung: die Suche läuft, findet
 * das Falsche, und die Antwort steht auf Treffern, die niemand angefordert hat.
 * Deshalb prüft jeder Ablehnungsfall unten nicht nur, dass `refineSearchQuery`
 * `null` gibt, sondern womit der Turn danach tatsächlich SUCHT.
 *
 * Und genau daran hängt der Befund, der beim Schreiben dieser Datei herauskam:
 * für die typische Formulierung ist der Fallback die unveränderte Nachricht.
 * Was der Auflöser kostet, wenn er ausfällt, steht deshalb unten in Zahlen und
 * nicht als Vermutung.
 */

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: 'Du bist ein Assistent.',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

/** Antwortet als Modell mit `content`, oder wirft, wenn eine Funktion kommt. */
function makePool(reply: string | (() => never) | (() => Promise<never>)) {
  const processRequest = vi.fn(async () => {
    if (typeof reply === 'function') return reply();
    return { content: reply };
  });
  return { processRequest } as unknown as AiClient & {
    processRequest: ReturnType<typeof vi.fn>;
  };
}

async function refine(reply: string | (() => never), userContent = 'Fass mir das zusammen') {
  return refineSearchQuery({
    userContent,
    conversationContext: null,
    topicalContext: null,
    aiClient: makePool(reply),
  });
}

/** Ein Turn mit @notebook-Mention — eine der fünf erzwungenen Suchen. */
function buildForcedSearchState(userMessage: string, pool: AiClient): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: {},
    aiClient: pool,
    userLocale: 'de-DE',
    clientPlatform: 'web',
    notebookIds: ['nb-1'],
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    pdfFormAttachments: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    defaultNotebookDocumentIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    boardIds: [],
    currentDocument: null,
    intent: 'direct',
    searchSources: [],
    searchQuery: null,
  } as unknown as ChatGraphState;
}

describe('refineSearchQuery — was der Auflöser liefert', () => {
  it('nimmt die Anfrage aus sauberem JSON', async () => {
    const result = await refine(
      '{"query": "kommunale Wärmeplanung Finanzierung", "subQueries": null}'
    );
    expect(result).toEqual({ query: 'kommunale Wärmeplanung Finanzierung', subQueries: null });
  });

  it('liest JSON auch aus Prosa und Code-Fences heraus', async () => {
    // `response_format: json_object` ist eine Bitte, keine Garantie — Provider
    // hängen Erklärsätze und Zäune an. Ein strenger Parser hier hiesse: jeder
    // solche Turn fällt auf die Heuristik zurück, ohne dass es auffällt.
    const result = await refine(
      'Klar, hier das Ergebnis:\n```json\n{"query": "Radwegplanung Hauptbahnhof"}\n```\nPasst das?'
    );
    expect(result?.query).toBe('Radwegplanung Hauptbahnhof');
  });

  it('behält Unterfragen ab zwei', async () => {
    const result = await refine(
      '{"query": "Wärmeplanung", "subQueries": ["Finanzierung", "Zeitplan"]}'
    );
    expect(result?.subQueries).toEqual(['Finanzierung', 'Zeitplan']);
  });

  it('verwirft eine einzelne Unterfrage', async () => {
    // Eine „Unter"-Frage ist die Anfrage nochmal, keine Zerlegung. Sie stehen zu
    // lassen hiesse, dieselbe Suche zweimal zu fahren und die Trefferliste mit
    // sich selbst zu mischen.
    const result = await refine('{"query": "Wärmeplanung", "subQueries": ["Wärmeplanung"]}');
    expect(result?.subQueries).toBeNull();
  });

  it('wirft nicht-string-Einträge aus den Unterfragen', async () => {
    const result = await refine(
      '{"query": "Wärmeplanung", "subQueries": ["Finanzierung", 42, null, "Zeitplan"]}'
    );
    expect(result?.subQueries).toEqual(['Finanzierung', 'Zeitplan']);
  });
});

describe('refineSearchQuery — wann er ablehnt, und was der Turn dann sucht', () => {
  /**
   * Jeder Fall zweimal: der Auflöser gibt `null`, UND der Turn trägt danach die
   * Anfrage aus dem Fallback. Nur die erste Hälfte zu prüfen ist der Test, der
   * grün bleibt, wenn der Aufrufer das `null` künftig als leere Anfrage
   * durchreicht — genau der Fehler, gegen den der Fail-safe existiert.
   *
   * WAS DER FALLBACK WIRKLICH IST, hier nachgemessen und nicht angenommen:
   * `extractSearchTopic` greift nur bei der Form „Formuliere eine Rede über X".
   * Für „Fass mir daraus den Teil zur Verkehrswende zusammen" — also für die
   * Formulierung, um derentwillen dieser Auflöser überhaupt existiert — gibt es
   * die Nachricht UNVERÄNDERT zurück. Der Fallback ist damit nicht „eine etwas
   * schlechtere Anfrage", sondern „die Aufgabenanweisung wortwörtlich als
   * Suchanfrage". Das ist die Zeile, an der man sieht, was ein Ausfall des
   * Auflösers kostet, und sie soll rot werden, wenn jemand die Heuristik
   * verbessert, ohne es hier zu vermerken.
   */
  const MESSAGE = 'Fass mir daraus den Teil zur Verkehrswende zusammen';
  const FALLBACK_QUERY = MESSAGE;

  const REJECTED: ReadonlyArray<readonly [string, string]> = [
    ['leere Antwort', ''],
    ['kein JSON', 'Ich habe leider keine Idee, wonach gesucht werden soll.'],
    ['kaputtes JSON', '{"query": "Verkehrs'],
    ['JSON ohne query-Feld', '{"subQueries": ["a", "b"]}'],
    ['leere query', '{"query": "   ", "subQueries": null}'],
    ['query ist kein String', '{"query": 42}'],
  ];

  for (const [label, reply] of REJECTED) {
    it(`lehnt ab: ${label}`, async () => {
      expect(await refine(reply, MESSAGE)).toBeNull();

      const pool = makePool(reply);
      const result = await classifierNode(buildForcedSearchState(MESSAGE, pool));
      expect(result.intent).toBe('search');
      expect(result.searchQuery).toBe(FALLBACK_QUERY);
      expect(result.subQueries).toBeNull();
    });
  }

  it('lehnt eine Anfrage ab, die so lang ist wie die Nachricht selbst', async () => {
    // Eine 200-Zeichen-Anfrage ist ein Modell, das nichts extrahiert hat.
    //
    // Die Kappung macht den Turn hier NICHT besser — der Fallback ist dieselbe
    // Nachricht, nur kürzer. Sie ist trotzdem richtig: eine überlange Anfrage
    // sähe wie eine Verfeinerung aus und würde `subQueries` mitschleppen,
    // während sie in Wahrheit dasselbe sucht wie der Fallback. Lieber sichtbar
    // zurückfallen als unsichtbar nichts tun.
    const echoed = `{"query": "${'sehr lange Anfrage '.repeat(15)}"}`;
    expect(await refine(echoed, MESSAGE)).toBeNull();

    const result = await classifierNode(buildForcedSearchState(MESSAGE, makePool(echoed)));
    expect(result.searchQuery).toBe(FALLBACK_QUERY);
  });

  it('lehnt ab, wenn der Anbieter wegbricht', async () => {
    const boom = (): never => {
      throw new Error('provider down');
    };
    expect(await refine(boom, MESSAGE)).toBeNull();

    const result = await classifierNode(buildForcedSearchState(MESSAGE, makePool(boom)));
    expect(result.intent).toBe('search');
    expect(result.searchQuery).toBe(FALLBACK_QUERY);
  });

  it('benutzt die Heuristik, wo sie etwas zu sagen hat', async () => {
    // Ohne diesen Fall prüfen alle Ablehnungen oben dasselbe: „Nachricht
    // unverändert durchgereicht". Dass dabei überhaupt `extractSearchTopic`
    // befragt wird — und nicht bloss `userContent` durchfällt — zeigt nur eine
    // Formulierung, die die Heuristik tatsächlich zerlegt.
    const message = 'Formuliere eine Rede über Verkehrswende';
    const result = await classifierNode(
      buildForcedSearchState(message, makePool('kein JSON hier'))
    );
    expect(result.searchQuery).toBe('Verkehrswende');
    expect(result.searchQuery).not.toBe(message);
  });

  it('sucht auch dann nach etwas, wenn die Heuristik nichts findet', async () => {
    // Letzte Verteidigungslinie: kein Auflöser, kein heuristisches Thema. Der
    // Turn muss trotzdem eine nicht-leere Anfrage tragen — die Suche läuft
    // ohnehin, die einzige Frage ist, ob sie mit oder ohne Anfrage läuft.
    const vague = 'Fass das mal zusammen';
    const result = await classifierNode(buildForcedSearchState(vague, makePool('kein JSON hier')));
    expect(result.intent).toBe('search');
    expect(result.searchQuery).toBeTruthy();
  });
});

describe('refineSearchQuery — was er dem Modell schickt', () => {
  it('fragt nicht mit dem grossen Klassifikator-Prompt', async () => {
    // Der Grund, warum es diesen Auflöser gibt: die Aufrufstelle schickte
    // 27.6k Zeichen Werkzeug-Taxonomie los, um eine Suchzeichenkette zu
    // bekommen, und verwarf das Intent-Verdikt danach hartkodiert.
    const pool = makePool('{"query": "Wärmeplanung"}');
    await refineSearchQuery({
      userContent: 'Fass mir das zusammen',
      conversationContext: null,
      topicalContext: null,
      aiClient: pool,
    });
    const sent = pool.processRequest.mock.calls[0]?.[0] as { systemPrompt?: string };
    expect(sent.systemPrompt).toContain('Du formulierst Suchanfragen');
    expect(sent.systemPrompt?.length).toBeLessThan(1_500);
  });

  it('reicht Themen- und Gesprächskontext mit', async () => {
    // Beide Felder kamen aus der alten Aufrufstelle mit. Fielen sie still weg,
    // verlöre „und was steht da zum Zeitplan?" seinen Bezug — und der Test, der
    // nur den Rückgabewert prüft, bliebe grün.
    const pool = makePool('{"query": "Zeitplan"}');
    await refineSearchQuery({
      userContent: 'Und was steht da zum Zeitplan?',
      conversationContext: 'Vorher ging es um die Wärmeplanung.',
      topicalContext: 'Thema: kommunale Wärmeplanung',
      aiClient: pool,
    });
    const sent = pool.processRequest.mock.calls[0]?.[0] as {
      messages?: Array<{ content: string }>;
    };
    const userMessage = sent.messages?.[0]?.content ?? '';
    expect(userMessage).toContain('kommunale Wärmeplanung');
    expect(userMessage).toContain('Vorher ging es um die Wärmeplanung.');
    expect(userMessage).toContain('Und was steht da zum Zeitplan?');
  });
});
