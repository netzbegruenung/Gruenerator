import { describe, it, expect, vi } from 'vitest';

const executeProvider = vi.fn();
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');
const { refineSearchQuery } = await import('./queryRefineResolver.js');

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
function answering(reply: string | (() => never) | (() => Promise<never>)) {
  executeProvider.mockReset();
  executeProvider.mockImplementation(async () => {
    if (typeof reply === 'function') return reply();
    return { content: reply, success: true, stop_reason: 'stop' };
  });
}

/** Die Anfrage-Hülle des Aufrufs `i`. */
function requestAt(i: number) {
  return (executeProvider.mock.calls[i] as [string, string, Record<string, any>])[2];
}

async function refine(reply: string | (() => never), userContent = 'Fass mir das zusammen') {
  answering(reply);
  return refineSearchQuery({
    userContent,
    conversationContext: null,
    topicalContext: null,
  });
}

/** Ein Turn mit @notebook-Mention — eine der fünf erzwungenen Suchen. */
function buildForcedSearchState(userMessage: string): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: {},
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

      answering(reply);
      const result = await classifierNode(buildForcedSearchState(MESSAGE));
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

    answering(echoed);
    const result = await classifierNode(buildForcedSearchState(MESSAGE));
    expect(result.searchQuery).toBe(FALLBACK_QUERY);
  });

  it('lehnt ab, wenn der Anbieter wegbricht', async () => {
    const boom = (): never => {
      throw new Error('provider down');
    };
    expect(await refine(boom, MESSAGE)).toBeNull();

    answering(boom);
    const result = await classifierNode(buildForcedSearchState(MESSAGE));
    expect(result.intent).toBe('search');
    expect(result.searchQuery).toBe(FALLBACK_QUERY);
  });

  it('benutzt die Heuristik, wo sie etwas zu sagen hat', async () => {
    // Ohne diesen Fall prüfen alle Ablehnungen oben dasselbe: „Nachricht
    // unverändert durchgereicht". Dass dabei überhaupt `extractSearchTopic`
    // befragt wird — und nicht bloss `userContent` durchfällt — zeigt nur eine
    // Formulierung, die die Heuristik tatsächlich zerlegt.
    const message = 'Formuliere eine Rede über Verkehrswende';
    const result = await classifierNode(buildForcedSearchState(message));
    expect(result.searchQuery).toBe('Verkehrswende');
    expect(result.searchQuery).not.toBe(message);
  });

  it('sucht auch dann nach etwas, wenn die Heuristik nichts findet', async () => {
    // Letzte Verteidigungslinie: kein Auflöser, kein heuristisches Thema. Der
    // Turn muss trotzdem eine nicht-leere Anfrage tragen — die Suche läuft
    // ohnehin, die einzige Frage ist, ob sie mit oder ohne Anfrage läuft.
    const vague = 'Fass das mal zusammen';
    answering('kein JSON hier');
    const result = await classifierNode(buildForcedSearchState(vague));
    expect(result.intent).toBe('search');
    expect(result.searchQuery).toBeTruthy();
  });

  /**
   * Live auf beta am 20.08.2026, und genau der Fall, den der Kommentar oben
   * beschreibt: der Auflöser fiel aus, und die Heuristik hatte zu dieser
   * Formulierung nichts zu sagen — die Einbettungssuche bekam
   * „schreibe darauf basierend einen antrag für mehr hitzeschtutz für alfter",
   * Tippfehler inklusive.
   *
   * Zwei Lücken auf einmal: „darauf basierend" stand nicht in den Füllwörtern,
   * und „antrag" fehlte in der Nomenliste — obwohl die Liste die Textsorten der
   * Partei tragen soll.
   */
  it('zerlegt eine Antragsbestellung mit Rückverweis auf das Material', async () => {
    const result = await classifierNode(
      buildForcedSearchState('Schreibe darauf basierend einen Antrag für mehr Hitzeschutz')
    );
    expect(result.searchQuery).toBe('mehr Hitzeschutz');
  });

  it('kennt die übrigen Antrags-Formen und den Beschluss', async () => {
    for (const [message, erwartet] of [
      ['Formuliere einen Antragstext zur Verkehrswende', 'Verkehrswende'],
      ['Erstelle eine Beschlussvorlage zum Radverkehr', 'Radverkehr'],
      ['Schreib daraus eine Resolution über Klimaschutz', 'Klimaschutz'],
    ] as const) {
      const result = await classifierNode(buildForcedSearchState(message));
      expect(result.searchQuery, message).toBe(erwartet);
    }
  });

  /**
   * Die Nomen der Liste sind Präfixe echter Wörter. Ohne Wortgrenze schneidet
   * `beschluss` mitten in „Beschlussempfehlung", und die Suche läuft mit
   * „empfehlung zum Wärmeplan" — schlechter als die unveränderte Anweisung,
   * und nichts im Log sagt, dass gekürzt wurde.
   */
  it('schneidet nicht in ein zusammengesetztes Wort hinein', async () => {
    const message = 'Erstelle eine Beschlussempfehlung zum Wärmeplan';
    const result = await classifierNode(buildForcedSearchState(message));
    expect(result.searchQuery).toBe(message);
  });
});

describe('refineSearchQuery — was er dem Modell schickt', () => {
  it('fragt nicht mit dem grossen Klassifikator-Prompt', async () => {
    // Der Grund, warum es diesen Auflöser gibt: die Aufrufstelle schickte
    // 27.6k Zeichen Werkzeug-Taxonomie los, um eine Suchzeichenkette zu
    // bekommen, und verwarf das Intent-Verdikt danach hartkodiert.
    answering('{"query": "Wärmeplanung"}');
    await refineSearchQuery({
      userContent: 'Fass mir das zusammen',
      conversationContext: null,
      topicalContext: null,
    });
    const sent = requestAt(0) as { systemPrompt?: string };
    expect(sent.systemPrompt).toContain('Du formulierst Suchanfragen');
    expect(sent.systemPrompt?.length).toBeLessThan(1_500);
  });

  it('reicht Themen- und Gesprächskontext mit', async () => {
    // Beide Felder kamen aus der alten Aufrufstelle mit. Fielen sie still weg,
    // verlöre „und was steht da zum Zeitplan?" seinen Bezug — und der Test, der
    // nur den Rückgabewert prüft, bliebe grün.
    answering('{"query": "Zeitplan"}');
    await refineSearchQuery({
      userContent: 'Und was steht da zum Zeitplan?',
      conversationContext: 'Vorher ging es um die Wärmeplanung.',
      topicalContext: 'Thema: kommunale Wärmeplanung',
    });
    const sent = requestAt(0) as {
      messages?: Array<{ content: string }>;
    };
    const userMessage = sent.messages?.[0]?.content ?? '';
    expect(userMessage).toContain('kommunale Wärmeplanung');
    expect(userMessage).toContain('Vorher ging es um die Wärmeplanung.');
    expect(userMessage).toContain('Und was steht da zum Zeitplan?');
  });

  /**
   * Der Kontext war schon immer da (Test darüber) — was fehlte, war die Ansage,
   * ihn zu BENUTZEN. Live am 24.08.2026 wurde „kannst du das wörtlich zitieren?"
   * nach einem Turn über Löschfristen zu „Wortwörtliche Zitate aus der
   * Datenschutzerklärung des GRÜNERATOR vom 09.07.2026": „das" landete auf dem
   * Dokument statt auf dem Thema. Bei 16 Chunks traf die Suche trotzdem, bei
   * einem grossen Dokument trifft sie nichts Bestimmtes — und der Ausfall sieht
   * dann nach einem Retrieval-Problem aus.
   *
   * Was dieser Test kann und was nicht: er hält fest, dass die Regel beim Modell
   * ANKOMMT. Ob das Modell sie befolgt, kann hier niemand prüfen — der Anbieter
   * ist eine Attrappe. Der Verhaltensbeweis ist ein Live-Lauf.
   */
  it('sagt dem Modell, dass Rückverweise auf den Verlauf aufzulösen sind', async () => {
    answering('{"query": "Löschfristen"}');
    await refineSearchQuery({
      userContent: 'kannst du das wörtlich zitieren?',
      conversationContext: 'GESPRÄCHSVERLAUF:\nNutzer: Welche Löschfristen nennt das PDF?',
      topicalContext: null,
    });
    const systemPrompt = (requestAt(0) as { systemPrompt?: string }).systemPrompt ?? '';
    expect(systemPrompt).toContain('GESPRÄCHSVERLAUF');
    expect(systemPrompt).toMatch(/"das"/);
  });

  /**
   * Die Gegenprobe zur Regel darüber. „fass das zusammen" OHNE erkennbares
   * Vorthema muss weiter beim Kern der Nachricht landen — sonst tauscht man
   * einen Ausfall gegen den anderen, und zwar unbemerkt, weil beide Regeln
   * dieselbe Formulierung („das") ansprechen.
   */
  it('behält die Regel für Nachrichten ganz ohne Thema', async () => {
    answering('{"query": "Zusammenfassung"}');
    await refineSearchQuery({
      userContent: 'fass das zusammen',
      conversationContext: null,
      topicalContext: null,
    });
    const systemPrompt = (requestAt(0) as { systemPrompt?: string }).systemPrompt ?? '';
    expect(systemPrompt).toContain('gibt auch der Verlauf keines her');
    expect(systemPrompt).toContain('Kern der Nachricht');
  });

  /**
   * Die zweite Gegenprobe, aus dem Review zu PR #2826: die Regel darf eine
   * eigenständige Frage nicht auf den Vorturn umbiegen. „Zeig mir die
   * Kontaktdaten" nach einem Turn über Löschfristen sucht Kontaktdaten — die
   * Vorrangregel steht deshalb VOR der Rückverweis-Regel und nennt den Fall
   * beim Namen. Die frühere Fassung führte blosse Artikel („die/der/dem") als
   * Auslöser, die in praktisch jedem deutschen Satz vorkommen.
   */
  it('stellt das eigene Thema der Nachricht über den Rückverweis', async () => {
    answering('{"query": "Kontaktdaten"}');
    await refineSearchQuery({
      userContent: 'Zeig mir die Kontaktdaten in der Datenschutzerklärung',
      conversationContext: 'GESPRÄCHSVERLAUF:\nNutzer: Welche Löschfristen nennt das PDF?',
      topicalContext: null,
    });
    const systemPrompt = (requestAt(0) as { systemPrompt?: string }).systemPrompt ?? '';
    expect(systemPrompt).toContain('Nennt die Nachricht selbst ein Thema, gilt dieses');
    // Und der Auslöser ist kein blosser Artikel mehr.
    expect(systemPrompt).not.toMatch(/"die\/der\/dem"/);
  });
});
