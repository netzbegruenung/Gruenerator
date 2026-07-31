/**
 * A system intent with no source behind it must not reach the agentic loop —
 * the loop would mount nothing and answer a live question from memory.
 *
 * Two ways that happened. The env one: no URL configured for the source. The
 * locale one: `reise` mounted train + hotel + weather and only the train was
 * German-only, so it deliberately stayed out of DE_ONLY_SYSTEM_INTENTS and
 * survived the audience degrade for Austria — on a bahn-only deploy an Austrian
 * travel turn forced the loop with an empty toolbox.
 *
 * `reise` is switched off now, so no active intent mixes audiences and the two
 * cases collapse into one. The locale still goes into the availability question,
 * as prevention for whatever brings a multi-source intent back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

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
 * Der Live-Quellen-Auflöser (Tier 3.7), auf die Quelle unter Test festgenagelt.
 *
 * Vorher war das die LLM-Stufe. Die Frage ist dieselbe geblieben — WELCHE Quelle
 * ist gemeint —, nur beantwortet sie jetzt ein Auflöser mit geschlossenem
 * Antwortraum. Die Verfügbarkeitsprüfung dahinter ist unverändert, und genau um
 * die geht es hier.
 */
function makeWorkerPool(scope: string) {
  return {
    processRequest: vi.fn(async (req: { systemPrompt?: string }) =>
      req.systemPrompt?.startsWith('Entscheide, ob diese Anfrage Daten')
        ? { content: scope }
        : { content: 'keine' }
    ),
  };
}

function buildState(
  overrides: Partial<ChatGraphState> & { userMessage: string; sourceScope: string }
): ChatGraphState & { aiWorkerPool: ReturnType<typeof makeWorkerPool> } {
  const { userMessage, sourceScope, ...rest } = overrides;
  const aiWorkerPool = makeWorkerPool(sourceScope);
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, research: true },
    aiWorkerPool,
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    boardIds: [],
    boardContext: null,
    sheetIds: [],
    sheetContext: null,
    docMentionIds: [],
    documentMentionContext: null,
    currentDocument: null,
    customSystemPrompt: null,
    userInstructions: null,
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    chatHistoryContext: null,
    isCompound: false,
    gatherSources: [],
    intent: 'direct' as SearchIntent,
    secondaryIntent: null,
    searchSources: [],
    searchQuery: null,
    subQueries: null,
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,
    contentType: null,
    documentSubtype: null,
    platform: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    researchBrief: null,
    researchMeta: null,
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    imagePrompt: null,
    imageStyle: null,
    imageEditStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    summaryContext: null,
    summaryTimeMs: 0,
    chartData: null,
    responseText: '',
    streamingStarted: false,
    contextWindowTokens: 128000,
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
    ...rest,
  } as ChatGraphState & { aiWorkerPool: ReturnType<typeof makeWorkerPool> };
}

const ENV_KEYS = [
  'SYSTEM_MCP_DB_URL',
  'SYSTEM_MCP_WEATHER_URL',
  'SYSTEM_MCP_ARD_URL',
  'SYSTEM_MCP_TRIVAGO_URL',
];
const saved: Record<string, string | undefined> = {};
const ORIGINAL_FLAG = process.env.CHAT_AGENT_LOOP;

beforeEach(() => {
  process.env.CHAT_AGENT_LOOP = 'true';
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Trains only — the deploy state that exposes the bug.
  process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.CHAT_AGENT_LOOP;
  else process.env.CHAT_AGENT_LOOP = ORIGINAL_FLAG;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('system intent availability degrades at the node', () => {
  // The phrasing has to contain a SYSTEM_MCP_PHRASING keyword ("Zugverbindung",
  // "Hotel", "Wetter"). Without one, Tier 3.5 demotes the turn to `agentic`
  // before the resolver runs — a "not reise" assertion would then pass without
  // ever reaching the degrade under test. Every case asserts the resolver ran.

  it('degrades a DE-only source to web for an Austrian user', async () => {
    // Die Locale-Hälfte der Verfügbarkeitsfrage. Der Fahrplan ist deutsch, die
    // Frage österreichisch — also gibt es hinter dem Intent nichts, was
    // antworten könnte, und der Turn muss in die Websuche statt an eine leere
    // Quelle.
    //
    // Stand hier vorher als zwei `reise`-Fälle: `reise` ist abgeschaltet und
    // ausserdem kein Wert im geschlossenen Antwortraum des Auflösers, die Fälle
    // konnten also gar nicht mehr entstehen. Sie ohne Ersatz zu löschen hätte
    // die Locale-Achse ungeprüft gelassen — sie ist der Grund, warum die
    // Verfügbarkeitsprüfung überhaupt eine Locale nimmt.
    const state = buildState({
      userMessage: 'Ich brauche eine Zugverbindung von Wien nach Graz',
      sourceScope: 'bahn',
      userLocale: 'de-AT',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    expect(result.intent).toBe('web');
    expect(result.searchQuery).toBeTruthy();
  });

  it('keeps a DE-only source for a German user', async () => {
    // Die Gegenrichtung — ohne sie liesse sich der Fall oben auch mit einer
    // Regel „degradiere immer" bestehen.
    const state = buildState({
      userMessage: 'Ich brauche eine Zugverbindung von Berlin nach Hamburg',
      sourceScope: 'bahn',
      userLocale: 'de-DE',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('bahn');
  });

  it('does not over-degrade a global source for an Austrian user', async () => {
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    const state = buildState({
      userMessage: 'Wie ist das Wetter in Graz?',
      sourceScope: 'wetter',
      userLocale: 'de-AT',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    // Open-Meteo covers Austria, so passing the locale must not drop it — the
    // guard against a naive "locale ≠ de-DE ⇒ unavailable".
    expect(result.intent).toBe('wetter');
  });

  it('degrades wetter when its source is not configured', async () => {
    const state = buildState({
      userMessage: 'Wie ist das Wetter in Graz?',
      sourceScope: 'wetter',
      userLocale: 'de-AT',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    expect(result.intent).toBe('web');
  });
});
