/**
 * The env-availability degrade has to ask per LOCALE.
 *
 * `reise` is the case that makes this more than tidiness: it mounts train +
 * hotel + weather, and only the train is German-only, so it is deliberately NOT
 * in DE_ONLY_SYSTEM_INTENTS — the audience degrade leaves it standing for
 * Austria on purpose. Asking availability without the locale then answers "yes"
 * on a deploy that has only the Deutsche-Bahn URL configured, the router forces
 * the agentic loop, `getSourcesForIntent(intent, 'de-AT')` mounts nothing, and
 * the model answers a live travel question from parametric memory.
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

/** LLM tier mock pinned to the intent under test. */
function makeWorkerPool(intent: string) {
  return {
    processRequest: vi.fn(async () => ({
      content: JSON.stringify({ intent, reasoning: 'llm', searchQuery: 'wien graz' }),
    })),
  };
}

function buildState(
  overrides: Partial<ChatGraphState> & { userMessage: string; llmIntent: string }
): ChatGraphState & { aiWorkerPool: ReturnType<typeof makeWorkerPool> } {
  const { userMessage, llmIntent, ...rest } = overrides;
  const aiWorkerPool = makeWorkerPool(llmIntent);
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

describe('system intent availability is locale-aware', () => {
  // The phrasing has to contain a SYSTEM_MCP_PHRASING keyword ("Zugverbindung",
  // "Hotel"). Without one, Tier 3.5 demotes the turn to `agentic` before the LLM
  // tier runs — a "not reise" assertion would then pass without ever reaching the
  // degrade under test. Every case asserts the LLM tier actually ran.

  it('degrades reise for an Austrian user when only the German source is configured', async () => {
    const state = buildState({
      userMessage: 'Ich brauche eine Zugverbindung von Wien nach Graz',
      llmIntent: 'reise',
      userLocale: 'de-AT',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    // Bahn is the only configured source and it does not cover Austria, so
    // forcing the loop here would mount nothing at all.
    expect(result.intent).toBe('web');
    expect(result.searchQuery).toBeTruthy();
  });

  it('keeps reise for a German user with the same env', async () => {
    const state = buildState({
      userMessage: 'Ich brauche eine Zugverbindung von Berlin nach Hamburg',
      llmIntent: 'reise',
      userLocale: 'de-DE',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    expect(result.intent).toBe('reise');
  });

  it('keeps reise for an Austrian user once a global source is configured', async () => {
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    const state = buildState({
      userMessage: 'Ich suche ein Hotel in Graz',
      llmIntent: 'reise',
      userLocale: 'de-AT',
    });
    const result = await classifierNode(state);
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalled();
    // Hotels are global — the Austrian keeps the intent, just without the train.
    expect(result.intent).toBe('reise');
  });
});
