/**
 * Compound Pipeline E2E Tests
 *
 * Tests the full ChatGraph pipeline for compound queries where a user
 * combines a notebook mention (@hamburg) with a skill mention (@pressemitteilung).
 * The pipeline should: classify → gather (search) → rerank → respond.
 *
 * Uses mocked external services (directSearch, LLM) but exercises real
 * node logic (classifierNode, searchNode, rerankNode, buildCitations).
 *
 * Die gescripteten Modell-Antworten hier gingen lange an die falschen Empfänger.
 * Sie waren als „classifier LLM" beschriftet, aber seit der Löschung der
 * LLM-Stufe fragt der Klassifikator auf diesem Pfad kein Modell mehr; die
 * Antwort bekam der `queryRefineResolver`, der ein `{ query }`-Objekt erwartet,
 * am Klassifikator-JSON scheiterte und still auf `extractSearchTopic` zurückfiel.
 * Die zweite, für den Reranker gedachte Antwort wurde nie abgeholt: der Test
 * bewachte den Rerank-Schritt mit `length > 3`, während der echte Aufrufer
 * (`intentExecutionService`) bei `> 2` reranked — bei genau 3 Treffern aus der
 * Fixture lief der Schritt hier also nie, obwohl er in Produktion läuft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external services BEFORE any imports ─────────────────────────

const mockExecuteDirectSearch = vi.fn();
const mockExecuteDirectWebSearch = vi.fn();
const mockExecuteDirectExamplesSearch = vi.fn();
const mockExecuteResearch = vi.fn();

vi.mock('../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectSearch: (...args: any[]) => mockExecuteDirectSearch(...args),
  executeDirectWebSearch: (...args: any[]) => mockExecuteDirectWebSearch(...args),
  executeDirectExamplesSearch: (...args: any[]) => mockExecuteDirectExamplesSearch(...args),
  executeResearch: (...args: any[]) => mockExecuteResearch(...args),
}));

const mockSelectAndCrawlTopUrls = vi.fn();
vi.mock('../../../services/search/CrawlingService.js', () => ({
  selectAndCrawlTopUrls: (...args: any[]) => mockSelectAndCrawlTopUrls(...args),
}));

const mockExpandQuery = vi.fn();
vi.mock('../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: (...args: any[]) => mockExpandQuery(...args),
}));

// Der Reranker ist ein Cross-Encoder-Dienst, KEINE Frage an den Worker-Pool —
// die „reranker LLM"-Antwort, die früher im Pool-Skript stand, konnte hier gar
// nicht ankommen. Ohne dieses Mock geht `rerankNode` mit echten Netzaufrufen bei
// Regolo raus und fällt bloss in seinen catch-Zweig zurück.
const mockRerank = vi.fn();
vi.mock('../../../services/search/RegoloRerankService.js', () => ({
  regoloRerankService: { rerank: (...args: any[]) => mockRerank(...args) },
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────

const executeProvider = vi.fn();
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { initializeChatState } = await import('./ChatGraph.js');
const { classifierNode } = await import('./nodes/classifierNode.js');
const { searchNode, buildCitations } = await import('./nodes/searchNode.js');
const { rerankNode } = await import('./nodes/rerankNode.js');
const { extractCompoundTopic } =
  await import('../../../routes/chat/services/compoundTopicExtractor.js');

/** Das Modell antwortet auf jeden Versuch mit `content`. */
function answering(content: string) {
  executeProvider.mockReset();
  executeProvider.mockResolvedValue({ content, success: true, stop_reason: 'stop' });
}
import type { ChatGraphState, SearchResult, GatherSource } from './types.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'gruenerator-oeffentlichkeitsarbeit',
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    name: 'Pressemitteilung',
    description: 'Pressemitteilungen verfassen',
    systemRole: 'Du schreibst Pressemitteilungen für die Grünen.',
    model: 'mistral-small-latest',
    params: { max_tokens: 2048, temperature: 0.7 },
    ...overrides,
  } as AgentConfig;
}

function makeUniversalAgentConfig(): AgentConfig {
  return {
    id: 'gruenerator-universal',
    identifier: 'gruenerator-universal',
    name: 'Universal',
    description: 'Standard assistant',
    systemRole: 'Du bist ein hilfreicher Assistent.',
    model: 'mistral-small-latest',
    params: { max_tokens: 2048, temperature: 0.7 },
  } as AgentConfig;
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [],
    threadId: null,
    agentConfig: makeAgentConfig(),
    enabledTools: { search: true, web: true, research: true },
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: ['hamburg-notebook'],
    notebookCollectionIds: ['hamburg'],
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
    isCompound: false,
    gatherSources: [],
    intent: 'search',
    secondaryIntent: null,
    searchSources: [],
    searchQuery: 'Hamburg Klimapolitik',
    subQueries: null,
    reasoning: 'test',
    contentType: null,
    documentSubtype: null,
    hasTemporal: false,
    complexity: 'moderate' as const,
    platform: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    researchBrief: null,
    researchMeta: null,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    imagePrompt: null,
    imageStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    summaryContext: null,
    summaryTimeMs: 0,
    responseText: '',
    streamingStarted: false,
    contextWindowTokens: 32000,
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
    ...overrides,
  };
}

/**
 * Die EINZIGE Modell-Frage, die der Klassifikator auf dem Notebook-Pfad noch
 * stellt: `queryRefineResolver`. Er liest `query` (plus optional `subQueries`) —
 * jedes andere Feld verwirft sein Parser, und ein unlesbares Objekt ist für ihn
 * dasselbe wie ein Timeout.
 */
function makeQueryRefineResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ query: 'Klimapolitik Hamburg', ...overrides });
}

function makeSearchResults(
  collection: string,
  count = 3
): {
  collection: string;
  results: Array<{ source: string; excerpt: string; url: string; relevance: string }>;
} {
  return {
    collection,
    results: Array.from({ length: count }, (_, i) => ({
      source: `${collection} Dokument ${i + 1}`,
      excerpt: `Inhalt zum Thema ${collection} Nummer ${i + 1}. Die Grünen setzen auf nachhaltige Politik.`,
      url: `https://gruene.de/${collection}/doc-${i + 1}`,
      relevance: i === 0 ? 'Sehr hoch' : i === 1 ? 'Hoch' : 'Mittel',
    })),
  };
}

function getSearchedCollections(): string[] {
  return [...new Set(mockExecuteDirectSearch.mock.calls.map((call: any[]) => call[0].collection))];
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Compound Pipeline: @notebook + @skill', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExecuteDirectSearch.mockImplementation(async ({ collection }: { collection: string }) =>
      makeSearchResults(collection)
    );

    mockExpandQuery.mockResolvedValue({ alternatives: [] });
    // Absteigende Werte, damit die Reihenfolge nach dem Rerank prüfbar die des
    // Rerankers ist und nicht zufällig die der Suche.
    mockRerank.mockImplementation(async ({ documents }: { documents: string[] }) =>
      documents.map((_, i) => ({ originalIndex: i, relevanceScore: 0.9 - i * 0.1 }))
    );
    mockSelectAndCrawlTopUrls.mockImplementation(async (results: any[]) =>
      results.map((r: any) => ({ ...r, crawled: false }))
    );
    // Der Verfeinerer ist auf diesen Pfaden die einzige Modell-Frage.
    answering(makeQueryRefineResponse());
  });

  // ── Classifier behavior for compound queries ──────────────────────

  describe('classifierNode with notebook + skill agent', () => {
    it('forces search intent when notebooks are mentioned with non-empty text', async () => {
      const state = makeState({
        messages: [
          { role: 'user' as const, content: 'erstelle eine Pressemitteilung über Klimapolitik' },
        ],
      });

      const result = await classifierNode(state);

      expect(result.intent).toBe('search');
      expect(result.gatherSources).toEqual(['notebook-search']);
      // Der Verfeinerer beantwortet WONACH gesucht wird, nicht OB — das Notebook
      // hat den Intent längst erzwungen. Vorher stand hier eine Antwort mit
      // `intent: 'research'`, die diesen Vorrang beweisen sollte; sie erreichte
      // den Klassifikator nie, weil er dieses Modell gar nicht mehr fragt.
      expect(result.searchQuery).toBe('Klimapolitik Hamburg');
    });

    it('forces search intent even with empty user text (all mentions stripped)', async () => {
      const state = makeState({
        messages: [{ role: 'user' as const, content: '' }],
      });

      const result = await classifierNode(state);

      expect(result.intent).toBe('search');
      expect(result.gatherSources).toEqual(['notebook-search']);
      expect(result.searchQuery).toBeNull();
    });

    it('returns gatherSources on all notebook-forced paths', async () => {
      // Verfeinerer fällt aus → deterministischer Fallback, aber gatherSources
      // müssen auf JEDEM dieser Pfade gesetzt sein.
      const state = makeState({
        messages: [{ role: 'user' as const, content: 'Klimapolitik Hamburg' }],
      });

      const result = await classifierNode(state);

      expect(result.intent).toBe('search');
      expect(result.gatherSources).toEqual(['notebook-search']);
    });
  });

  // ── Topic extraction for vague compound queries ───────────────────

  describe('extractCompoundTopic', () => {
    it('extracts topic from "erstelle Pressemitteilung über Klimapolitik"', () => {
      expect(
        extractCompoundTopic('erstelle Pressemitteilung über Klimapolitik', ['hamburg-notebook'])
      ).toBe('Klimapolitik');
    });

    it('falls back to notebook name when text is empty', () => {
      expect(extractCompoundTopic('', ['hamburg-notebook'])).toBe('Hamburg');
    });

    it('falls back to notebook name when text is just action words', () => {
      expect(extractCompoundTopic('erstelle eine', ['hamburg-notebook'])).toBe('Hamburg');
    });
  });

  // ── Search scoping for compound queries ──��────────────────────────

  describe('searchNode respects notebook scoping in compound queries', () => {
    it('searches only in notebook-scoped collections', async () => {
      const state = makeState({
        notebookCollectionIds: ['hamburg'],
        notebookDocumentIds: [],
        searchQuery: 'Klimapolitik',
        intent: 'search',
      });

      await searchNode(state);

      const collections = getSearchedCollections();
      expect(collections).toEqual(['hamburg']);
    });

    it('returns results from the scoped collection', async () => {
      const state = makeState({
        notebookCollectionIds: ['hamburg'],
        notebookDocumentIds: [],
        searchQuery: 'Klimapolitik',
        intent: 'search',
      });

      const result = await searchNode(state);

      expect(result.searchResults!.length).toBeGreaterThan(0);
      expect(result.searchResults![0].source).toContain('hamburg');
    });
  });

  // ── Full compound pipeline simulation ─────────────────────────────

  describe('full pipeline: classify → search → rerank → citations', () => {
    it('processes @hamburg + @pressemitteilung with topic text', async () => {
      // Erste Frage: queryRefineResolver (im Klassifikator)
      answering(makeQueryRefineResponse());

      // Step 1: Initialize state (simulates controller)
      const state = makeState({
        messages: [
          { role: 'user' as const, content: 'erstelle eine Pressemitteilung über Klimapolitik' },
        ],
        notebookIds: ['hamburg-notebook'],
        notebookCollectionIds: ['hamburg'],
        notebookDocumentIds: [],
        agentConfig: makeAgentConfig(),
      });

      // Step 2: Classify
      const classifiedPartial = await classifierNode(state);
      const classifiedState = { ...state, ...classifiedPartial } as ChatGraphState;

      expect(classifiedState.intent).toBe('search');
      expect(classifiedState.gatherSources).toEqual(['notebook-search']);

      // Step 3: Compound detection (simulates controller logic)
      const isCompound =
        state.notebookIds.length > 0 && state.agentConfig.identifier !== 'gruenerator-universal';
      expect(isCompound).toBe(true);

      classifiedState.isCompound = isCompound;
      // Der Verfeinerer hat geantwortet, also greift der Themen-Fallback hier
      // nicht — er hat seine eigenen Fälle oben. Dass er FRÜHER griff, lag nur
      // daran, dass die gescriptete Antwort an ihm vorbeilief.
      expect(classifiedState.searchQuery).toBe('Klimapolitik Hamburg');
      if (!classifiedState.searchQuery) {
        classifiedState.searchQuery = extractCompoundTopic(
          'erstelle eine Pressemitteilung über Klimapolitik',
          state.notebookIds
        );
      }

      // Step 4: Search (gather phase)
      const searchResult = await searchNode(classifiedState);
      const searchedState = { ...classifiedState, ...searchResult } as ChatGraphState;

      expect(searchedState.searchResults!.length).toBeGreaterThan(0);
      expect(getSearchedCollections()).toEqual(['hamburg']);

      // Step 5: Rerank — dieselbe Schwelle wie im echten Aufrufer
      // (`intentExecutionService`: `searchResults.length > 2`). Hier stand `> 3`,
      // und weil die Fixture genau 3 Treffer liefert, lief der Schritt nie: der
      // Test versprach in seiner Überschrift einen Rerank, den er nicht ausführte.
      expect(searchedState.searchResults!.length).toBeGreaterThan(2);
      const rerankResult = await rerankNode(searchedState);
      const rerankedState = { ...searchedState, ...rerankResult } as ChatGraphState;
      expect(mockRerank).toHaveBeenCalledTimes(1);
      expect(rerankedState.searchResults!.length).toBeGreaterThanOrEqual(1);
      // Der Verfeinerer ist die einzige Modell-Frage auf diesem Pfad.
      expect(executeProvider).toHaveBeenCalledTimes(1);

      // Step 6: Build citations
      const citations = buildCitations(searchedState.searchResults!);
      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].url).toContain('hamburg');

      // Step 7: Verify agent config is preserved for response phase
      expect(searchedState.agentConfig.identifier).toBe('gruenerator-oeffentlichkeitsarbeit');
    });

    it('handles empty user text (@hamburg @presse with no topic)', async () => {
      answering('{}');

      const state = makeState({
        messages: [{ role: 'user' as const, content: '' }],
        notebookIds: ['hamburg-notebook'],
        notebookCollectionIds: ['hamburg'],
        notebookDocumentIds: [],
        agentConfig: makeAgentConfig(),
        searchQuery: null,
      });

      // Classify — should force search even with empty text
      const classifiedPartial = await classifierNode(state);
      expect(classifiedPartial.intent).toBe('search');
      expect(classifiedPartial.gatherSources).toEqual(['notebook-search']);

      // Topic extraction fallback
      const topic = extractCompoundTopic('', ['hamburg-notebook']);
      expect(topic).toBe('Hamburg');

      // Search with fallback topic
      const searchState = {
        ...state,
        ...classifiedPartial,
        searchQuery: topic,
      } as ChatGraphState;

      const searchResult = await searchNode(searchState);
      expect(searchResult.searchResults!.length).toBeGreaterThan(0);
      expect(getSearchedCollections()).toEqual(['hamburg']);
    });
  });

  // ── Non-compound queries are unaffected ───────────────────────────

  describe('non-compound queries remain unchanged', () => {
    it('notebook-only query (no skill agent) still forces search', async () => {
      const state = makeState({
        messages: [{ role: 'user' as const, content: 'Klimapolitik Hamburg' }],
        notebookIds: ['hamburg-notebook'],
        notebookCollectionIds: ['hamburg'],
        notebookDocumentIds: [],
        agentConfig: makeUniversalAgentConfig(),
      });

      const result = await classifierNode(state);
      expect(result.intent).toBe('search');
      expect(result.gatherSources).toEqual(['notebook-search']);

      // But it's NOT compound because agent is universal
      const isCompound =
        state.notebookIds.length > 0 && state.agentConfig.identifier !== 'gruenerator-universal';
      expect(isCompound).toBe(false);
    });

    it('skill-only query (no notebook) uses normal classifier path', async () => {
      const state = makeState({
        messages: [
          { role: 'user' as const, content: 'Schreibe eine Pressemitteilung über Klimapolitik' },
        ],
        notebookIds: [],
        notebookCollectionIds: [],
        notebookDocumentIds: [],
        agentConfig: makeAgentConfig(),
      });

      const result = await classifierNode(state);
      // Ohne Notebook erzwingt nichts `search` — der Turn geht den gewöhnlichen
      // Weg durch die Regeltabelle. `toBeDefined()` stand hier vorher und war
      // keine Aussage: der Knoten liefert IMMER einen Intent.
      expect(result.intent).toBe('agentic');
      expect(result.gatherSources).toBeUndefined();
    });
  });
});
