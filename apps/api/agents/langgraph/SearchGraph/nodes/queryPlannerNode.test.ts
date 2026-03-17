/**
 * Tests for SearchGraph queryPlannerNode
 * Run with: npx vitest run apps/api/agents/langgraph/SearchGraph/nodes/queryPlannerNode.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

import { queryPlannerNode } from './queryPlannerNode.js';

import type { SearchGraphState } from '../types.js';

// Mock the external services
vi.mock('../../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: vi.fn().mockResolvedValue({
    primary: 'test query',
    alternatives: ['alternative query 1', 'alternative query 2'],
  }),
}));

vi.mock('../../../../services/search/TemporalAnalyzer.js', () => ({
  analyzeTemporality: vi.fn().mockReturnValue({
    urgency: 'none',
    expressions: [],
    timeRange: undefined,
  }),
}));

vi.mock('../../WebSearchGraph/utilities/queryOptimizer.js', () => ({
  generateResearchQuestions: vi
    .fn()
    .mockResolvedValue([
      'Was ist der Hintergrund?',
      'Welche aktuellen Entwicklungen gibt es?',
      'Welche Auswirkungen hat das?',
    ]),
}));

function makeState(overrides: Partial<SearchGraphState> = {}): SearchGraphState {
  return {
    messages: [{ role: 'user', content: 'Verkehrswende in Kommunen' }],
    threadId: null,
    searchMode: 'web',
    aiWorkerPool: null as any,
    userLocale: 'de-DE',
    agentConfig: {} as any,
    searchQuery: null,
    subQueries: null,
    hasTemporal: false,
    complexity: 'simple',
    queryType: 'general',
    intent: 'search',
    searchSources: ['documents', 'web'],
    notebookCollectionIds: [],
    defaultNotebookCollectionIds: [],
    detectedFilters: null,
    enabledTools: { search: true, web: true, examples: true, research: true },
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    webSearchBatches: [],
    crawlDecisions: [],
    enrichedResults: [],
    categorizedSources: null,
    crawlMetadata: null,
    searchOptions: {},
    responseText: '',
    followUpSuggestions: [],
    startTime: Date.now(),
    queryOptimizeTimeMs: 0,
    searchTimeMs: 0,
    crawlTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
    ...overrides,
  };
}

describe('queryPlannerNode', () => {
  it('extracts search topic from raw query', async () => {
    const state = makeState({
      messages: [{ role: 'user', content: 'Suche nach Verkehrswende in Kommunen' }],
    });

    const result = await queryPlannerNode(state);

    expect(result.searchQuery).toBe('Verkehrswende in Kommunen');
  });

  it('generates subqueries via query expansion in web mode', async () => {
    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.subQueries).toBeTruthy();
    expect(result.subQueries!.length).toBeGreaterThanOrEqual(2);
  });

  it('classifies person queries', async () => {
    const state = makeState({
      messages: [{ role: 'user', content: 'Wer ist Moritz Wächter?' }],
    });

    const result = await queryPlannerNode(state);

    expect(result.queryType).toBe('person');
  });

  it('classifies news queries and detects temporal', async () => {
    const { analyzeTemporality } = await import('../../../../services/search/TemporalAnalyzer.js');
    (analyzeTemporality as any).mockReturnValueOnce({
      urgency: 'current',
      expressions: ['aktuell'],
      timeRange: 'month',
    });

    const state = makeState({
      messages: [{ role: 'user', content: 'aktuelle Entwicklungen Energiewende' }],
    });

    const result = await queryPlannerNode(state);

    expect(result.queryType).toBe('news');
    expect(result.hasTemporal).toBe(true);
  });

  it('classifies comparative queries', async () => {
    const state = makeState({
      messages: [{ role: 'user', content: 'Vergleich Verkehrspolitik Deutschland Österreich' }],
    });

    const result = await queryPlannerNode(state);

    expect(result.queryType).toBe('comparative');
  });

  it('generates research questions in deep mode', async () => {
    const state = makeState({ searchMode: 'deep' });
    const result = await queryPlannerNode(state);

    expect(result.subQueries).toBeTruthy();
    expect(result.subQueries!.length).toBeGreaterThanOrEqual(3);
    expect(result.complexity).toBe('complex');
  });

  it('sets queryOptimizeTimeMs', async () => {
    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.queryOptimizeTimeMs).toBeGreaterThanOrEqual(0);
  });
});
