/**
 * Compound Pipeline E2E Tests
 *
 * Tests the full ChatGraph pipeline for compound queries where a user
 * combines a notebook mention (@hamburg) with a skill mention (@pressemitteilung).
 * The pipeline should: classify → gather (search) → rerank → respond.
 *
 * Uses mocked external services (directSearch, LLM) but exercises real
 * node logic (classifierNode, searchNode, rerankNode, buildCitations).
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

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────

import { initializeChatState } from './ChatGraph.js';
import { classifierNode } from './nodes/classifierNode.js';
import { searchNode, buildCitations } from './nodes/searchNode.js';
import { rerankNode } from './nodes/rerankNode.js';
import { extractCompoundTopic } from '../../../routes/chat/services/compoundTopicExtractor.js';
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
    contextPrefix: '[Plattform: Pressemitteilung]',
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
    aiWorkerPool: {
      processRequest: vi.fn().mockResolvedValue({ content: '{}' }),
    },
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: ['hamburg-notebook'],
    notebookCollectionIds: ['hamburg'],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    boardIds: [],
    boardContext: null,
    docMentionIds: [],
    documentMentionContext: null,
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
    hasTemporal: false,
    complexity: 'moderate' as const,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    researchBrief: null,
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

function makeClassifierLLMResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    intent: 'search',
    searchQuery: 'Klimapolitik Hamburg',
    optimizedSearchQuery: 'Klimapolitik Hamburg',
    subQueries: null,
    searchSources: [],
    filters: null,
    needsClarification: false,
    reasoning: 'Notebook mention with search topic',
    ...overrides,
  });
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
    mockSelectAndCrawlTopUrls.mockImplementation(async (results: any[]) =>
      results.map((r: any) => ({ ...r, crawled: false }))
    );
  });

  // ── Classifier behavior for compound queries ──────────────────────

  describe('classifierNode with notebook + skill agent', () => {
    it('forces search intent when notebooks are mentioned with non-empty text', async () => {
      const state = makeState({
        messages: [
          { role: 'user' as const, content: 'erstelle eine Pressemitteilung über Klimapolitik' },
        ],
        aiWorkerPool: {
          processRequest: vi.fn().mockResolvedValue({
            content: makeClassifierLLMResponse({ intent: 'research' }),
          }),
        },
      });

      const result = await classifierNode(state);

      expect(result.intent).toBe('search');
      expect(result.gatherSources).toEqual(['notebook-search']);
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
      // LLM fails → heuristic fallback should still have gatherSources
      const state = makeState({
        messages: [{ role: 'user' as const, content: 'Klimapolitik Hamburg' }],
        aiWorkerPool: {
          processRequest: vi.fn().mockRejectedValue(new Error('LLM timeout')),
        },
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
      const aiWorkerPool = {
        processRequest: vi
          .fn()
          // First call: classifier LLM
          .mockResolvedValueOnce({
            content: makeClassifierLLMResponse({
              intent: 'research',
              searchQuery: 'Klimapolitik Hamburg',
              optimizedSearchQuery: 'Klimapolitik Hamburg',
            }),
          })
          // Second call: reranker LLM
          .mockResolvedValueOnce({
            content: JSON.stringify({
              scores: [
                { index: 0, score: 5 },
                { index: 1, score: 4 },
                { index: 2, score: 3 },
              ],
            }),
          }),
      };

      // Step 1: Initialize state (simulates controller)
      const state = makeState({
        messages: [
          { role: 'user' as const, content: 'erstelle eine Pressemitteilung über Klimapolitik' },
        ],
        notebookIds: ['hamburg-notebook'],
        notebookCollectionIds: ['hamburg'],
        agentConfig: makeAgentConfig(),
        aiWorkerPool,
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

      // Step 5: Rerank (if enough results)
      if (searchedState.searchResults!.length > 3) {
        const rerankResult = await rerankNode(searchedState);
        const rerankedState = { ...searchedState, ...rerankResult } as ChatGraphState;
        expect(rerankedState.searchResults!.length).toBeGreaterThanOrEqual(1);
      }

      // Step 6: Build citations
      const citations = buildCitations(searchedState.searchResults!);
      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].url).toContain('hamburg');

      // Step 7: Verify agent config is preserved for response phase
      expect(searchedState.agentConfig.identifier).toBe('gruenerator-oeffentlichkeitsarbeit');
      expect(searchedState.agentConfig.contextPrefix).toBe('[Plattform: Pressemitteilung]');
    });

    it('handles empty user text (@hamburg @presse with no topic)', async () => {
      const aiWorkerPool = {
        processRequest: vi.fn().mockResolvedValue({ content: '{}' }),
      };

      const state = makeState({
        messages: [{ role: 'user' as const, content: '' }],
        notebookIds: ['hamburg-notebook'],
        notebookCollectionIds: ['hamburg'],
        agentConfig: makeAgentConfig(),
        aiWorkerPool,
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
        agentConfig: makeUniversalAgentConfig(),
        aiWorkerPool: {
          processRequest: vi.fn().mockResolvedValue({
            content: makeClassifierLLMResponse(),
          }),
        },
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
        agentConfig: makeAgentConfig(),
        aiWorkerPool: {
          processRequest: vi.fn().mockResolvedValue({
            content: makeClassifierLLMResponse({ intent: 'research' }),
          }),
        },
      });

      const result = await classifierNode(state);
      // Without notebooks, classifier goes through normal LLM path
      expect(result.intent).toBeDefined();
      expect(result.gatherSources).toBeUndefined();
    });
  });
});
