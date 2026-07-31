import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * Live-Quelle oder Politikfrage — die eine Klassifikator-Entscheidung, für die
 * der Code selbst begründet, dass eine Heuristik nicht reicht.
 *
 * „Bahnreform", „Tourismuspolitik" und „Klimapolitik" teilen sich das Vokabular
 * mit Fahrplänen, Hotels und Wetter. Ein Politik-Turn darf nie eine
 * Abfahrtstafel ziehen. Daraus folgt aber nicht, dass die Entscheidung 27k
 * Zeichen Werkzeug-Taxonomie braucht — sie braucht einen Antwortraum mit fünf
 * Werten.
 *
 * Geprüft wird deshalb beides: dass die Live-Quelle greift, UND dass die
 * Politikfrage sie nicht auslöst. Nur der erste Teil wäre der Test, der bei der
 * einzigen Formulierung grün ist, die man beim Schreiben im Kopf hatte.
 */

const isSystemIntentAvailable = vi.fn(() => true);

vi.mock('../../../../services/mcp/systemMcpServers.js', () => ({
  SYSTEM_MCP_INTENTS: new Set(['bahn', 'reise', 'hotel', 'wetter', 'news']),
  isSystemIntentAvailable,
}));

const { classifierNode } = await import('./classifierNode.js');

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

/**
 * Jeder Prompt, den der Klassifikator verschickt, muss von einem der drei
 * kleinen Auflöser stammen.
 *
 * Der Zähler hiess `bigPromptCalls` und zählte Aufrufe der LLM-Stufe; die ist
 * gelöscht, und damit dreht sich seine Aussage um: er muss LEER bleiben. Ein
 * Aufruf mit unbekanntem Präfix heisst entweder, dass ein Auflöser dazugekommen
 * ist, ohne in dieser Liste zu stehen (dann prüfen die Fälle unten ihren eigenen
 * Stub), oder dass jemand wieder eine Katalogstufe eingebaut hat. Beides soll
 * hier auffallen — dieselbe Pflicht wie bei den beiden `RESOLVER_DEFAULTS`-Listen.
 */
const SMALL_RESOLVER_PREFIXES = [
  'Entscheide, ob diese Anfrage Daten', // sourceScopeResolver
  'Entscheide, ob diese Nachricht ein ARTEFAKT', // generationResolver
  'Ein Gespräch hat mehrere Artefakte', // docsIntentTiebreak
];

function makeWorkerPool(scopeAnswer: string | (() => never)) {
  const unknownPromptCalls: string[] = [];
  const processRequest = vi.fn(async (req: { systemPrompt?: string }) => {
    if (req.systemPrompt?.startsWith('Entscheide, ob diese Anfrage Daten')) {
      if (typeof scopeAnswer === 'function') scopeAnswer();
      return { content: scopeAnswer };
    }
    if (SMALL_RESOLVER_PREFIXES.some((p) => req.systemPrompt?.startsWith(p))) {
      return { content: 'keine' };
    }
    unknownPromptCalls.push(req.systemPrompt ?? '(kein Systemprompt)');
    return { content: 'keine' };
  });
  return { processRequest, unknownPromptCalls };
}

function buildState(
  overrides: Partial<ChatGraphState> & { userMessage: string; pool: { processRequest: unknown } }
): ChatGraphState {
  const { userMessage, pool, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: {},
    aiWorkerPool: pool,
    userLocale: 'de-DE',
    clientPlatform: 'web',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    boardIds: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

beforeEach(() => {
  isSystemIntentAvailable.mockReset();
  isSystemIntentAvailable.mockReturnValue(true);
});

describe('classifierNode — Live-Quelle vor der LLM-Stufe', () => {
  it('beantwortet die Wetterfrage aus der Quelle, ohne den grossen Prompt', async () => {
    const pool = makeWorkerPool('wetter');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie wird das Wetter morgen in Freiburg?', pool })
    );
    expect(result.intent).toBe('wetter');
    expect(pool.unknownPromptCalls).toEqual([]);
  });

  it('macht aus der Politikfrage keine Wetterauskunft', async () => {
    const pool = makeWorkerPool('keine');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie steht die Partei zur Klimapolitik im Verkehr?', pool })
    );
    expect(result.intent).not.toBe('wetter');
  });

  it('liest keine Quelle aus einer Begründung heraus', async () => {
    // „keine — das ist Bahnpolitik": eine Teilstring-Suche läse hier `bahn`,
    // also genau die Verwechslung, die der Prompt zuletzt ausschliesst.
    //
    // Die Nachricht muss den Auflöser wirklich erreichen, sonst ist der Fall
    // grün, ohne etwas zu prüfen. Seit der Default-Inversion führt dorthin nur
    // noch EIN Weg: `SYSTEM_MCP_PHRASING` muss den Turn vor Tier 3.5
    // zurückhalten. Genau deshalb steht hier jetzt das Wort "Bahn" — die Frage
    // ist trotzdem Politik, und das ist der Punkt.
    const pool = makeWorkerPool('keine — das ist Bahnpolitik, keine Fahrplanauskunft.');
    const result = await classifierNode(
      buildState({
        userMessage: 'Wie steht die Partei zur Deutschen Bahn?',
        pool,
      })
    );
    expect(pool.processRequest).toHaveBeenCalled();
    expect(result.intent).not.toBe('bahn');
  });

  it('gibt einen Turn, der keine Live-Quelle braucht, ins Residual weiter', async () => {
    // Reine Wortkunst ist in sich geschlossen: nicht in den Loop demotiert, nicht
    // vom Live-Quellen-Gitter gehalten, und — anders als ein Umschreibe-Auftrag —
    // auch nicht vom Generierungs-Gitter beansprucht („kürze" steht dort drin).
    // Sie erreicht den Auflöser also auf dem regulären Weg und nach dessen
    // `keine` das Residual — die Regeltabelle behält ihr eigenes Verdikt.
    //
    // Zwei Formulierungen sind hier schon verbrannt: die Sachfrage, die vorher
    // stand, loopt seit der Default-Inversion; der Umschreibe-Auftrag danach
    // wird seit dem Generierungs-Auflöser vor Tier 4 entschieden. Beide Male
    // fiel es erst auf, als der Zähler oben ehrlich wurde.
    const pool = makeWorkerPool('keine');
    const result = await classifierNode(
      buildState({
        userMessage: 'Schreib mir ein Gedicht über den Wald im Herbst',
        pool,
      })
    );
    expect(result.intent).toBe('produktion');
    expect(pool.unknownPromptCalls).toEqual([]);
  });

  it('degradiert auf Websuche, wenn die Quelle im Deploy nicht konfiguriert ist', async () => {
    // Ohne Deploy-Env hat der Intent keine Werkzeuge hinter sich. Ihn trotzdem
    // zu setzen hiesse, den Turn an eine Quelle zu schicken, die nicht antwortet.
    isSystemIntentAvailable.mockReturnValue(false);
    const pool = makeWorkerPool('wetter');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie wird das Wetter morgen in Freiburg?', pool })
    );
    // Nicht ins Residual: der Nutzer hat nach einer Vorhersage gefragt, und die
    // Antwort darf nicht aus dem Gedächtnis kommen, bloss weil die Spezialquelle
    // im Deploy fehlt. `web` statt Loop, weil der Planer im Loop entscheiden
    // KÖNNTE, kein Werkzeug zu brauchen — bei genau dieser Turn-Form wäre das
    // die falsche Entscheidung.
    expect(result.intent).toBe('web');
  });

  it('gibt den Turn in den Loop, wenn der Auflöser wegbricht', async () => {
    const pool = makeWorkerPool(() => {
      throw new Error('provider down');
    });
    const result = await classifierNode(
      buildState({ userMessage: 'Wann fährt der nächste Zug nach Köln?', pool })
    );
    expect(result.intent).toBe('agentic');
  });

  it('erreicht auch die Formulierungen, die der Prompt nur behauptet hat', async () => {
    // Diese Zeile hielt bis zum 31.07.2026 die Gegenrichtung fest: „Pollen-
    // belastung" stand nicht in SYSTEM_MCP_PHRASING, der Turn wurde bei Tier 3.5
    // in den Loop demotiert und erreichte weder den Auflöser noch früher den
    // grossen Prompt — obwohl der Auflöser-Prompt „Pollen" als seine Zuständig-
    // keit AUFFÜHRT. Nachgemessen waren es 6 von 13 beworbenen Formulierungen.
    //
    // Das Gitter kennt sie jetzt. Die vollständige Tabelle steht in
    // `classifierSourceScopeReach.vitest.ts`; hier bleibt der eine Fall, an dem
    // die Lücke ursprünglich auffiel.
    const pool = makeWorkerPool('wetter');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie hoch ist die Pollenbelastung in Nürnberg gerade?', pool })
    );
    expect(result.intent).toBe('wetter');
    expect(pool.unknownPromptCalls).toEqual([]);
  });
});
