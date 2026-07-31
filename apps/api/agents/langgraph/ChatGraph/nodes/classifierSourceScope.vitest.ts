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

/** Trennt den Auflöser vom grossen Prompt am Systemprompt. */
function makeWorkerPool(scopeAnswer: string | (() => never)) {
  const bigPromptCalls: number[] = [];
  const processRequest = vi.fn(async (req: { systemPrompt?: string }) => {
    if (req.systemPrompt?.startsWith('Entscheide, ob diese Anfrage Daten')) {
      if (typeof scopeAnswer === 'function') scopeAnswer();
      return { content: scopeAnswer };
    }
    bigPromptCalls.push(1);
    return {
      content: JSON.stringify({ intent: 'web', reasoning: 'LLM-Stufe', searchQuery: null }),
    };
  });
  return { processRequest, bigPromptCalls };
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
    expect(pool.bigPromptCalls).toHaveLength(0);
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
    // Die Nachricht muss die LLM-Stufe wirklich erreichen, sonst läuft der
    // Auflöser gar nicht und der Fall ist grün, ohne etwas zu prüfen — eine
    // Frage nach der Bahnreform wird vorher in den Loop demotiert.
    const pool = makeWorkerPool('keine — das ist Bahnpolitik, keine Fahrplanauskunft.');
    const result = await classifierNode(
      buildState({
        userMessage: 'Erklär den Unterschied zwischen Nationalrat und Bundesrat in Österreich',
        pool,
      })
    );
    expect(pool.processRequest).toHaveBeenCalled();
    expect(result.intent).not.toBe('bahn');
  });

  it('gibt einen Turn, der keine Live-Quelle braucht, an die LLM-Stufe weiter', async () => {
    const pool = makeWorkerPool('keine');
    await classifierNode(
      buildState({
        userMessage: 'Erklär den Unterschied zwischen Nationalrat und Bundesrat in Österreich',
        pool,
      })
    );
    expect(pool.bigPromptCalls.length).toBeGreaterThan(0);
  });

  it('geht zur LLM-Stufe, wenn die Quelle im Deploy nicht konfiguriert ist', async () => {
    // Ohne Deploy-Env hat der Intent keine Werkzeuge hinter sich. Ihn trotzdem
    // zu setzen hiesse, den Turn an eine Quelle zu schicken, die nicht antwortet.
    isSystemIntentAvailable.mockReturnValue(false);
    const pool = makeWorkerPool('wetter');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie wird das Wetter morgen in Freiburg?', pool })
    );
    expect(result.intent).not.toBe('wetter');
    expect(pool.bigPromptCalls.length).toBeGreaterThan(0);
  });

  it('geht zur LLM-Stufe, wenn der Auflöser wegbricht', async () => {
    const pool = makeWorkerPool(() => {
      throw new Error('provider down');
    });
    const result = await classifierNode(
      buildState({ userMessage: 'Wann fährt der nächste Zug nach Köln?', pool })
    );
    expect(pool.bigPromptCalls.length).toBeGreaterThan(0);
    expect(result.intent).toBeTruthy();
  });

  it('erreicht dieselben Turns wie der Prompt vorher — und dieselben nicht', async () => {
    // „Pollenbelastung" steht nicht in SYSTEM_MCP_PHRASING, also wird der Turn
    // schon bei Tier 3.5 in den Loop demotiert und erreicht weder den Auflöser
    // noch früher den grossen Prompt. Diese Lücke ist älter als der Auflöser und
    // wird von ihm weder geschlossen noch vergrössert — festgehalten, damit
    // niemand sie später für einen Rückschritt dieses Umbaus hält.
    const pool = makeWorkerPool('wetter');
    const result = await classifierNode(
      buildState({ userMessage: 'Wie hoch ist die Pollenbelastung in Nürnberg gerade?', pool })
    );
    expect(result.intent).toBe('agentic');
    expect(pool.bigPromptCalls).toHaveLength(0);
  });
});
