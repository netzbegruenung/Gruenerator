/**
 * Tests for SearchGraph searchRespondNode
 * Run with: npx vitest run apps/api/agents/langgraph/SearchGraph/nodes/searchRespondNode.test.ts
 */

import { describe, it, expect } from 'vitest';

import { searchRespondNode } from './searchRespondNode.js';

import type { SearchGraphState } from '../types.js';

function makeState(overrides: Partial<SearchGraphState> = {}): SearchGraphState {
  return {
    messages: [{ role: 'user', content: 'test query' }],
    threadId: null,
    searchMode: 'web',
    aiWorkerPool: null as any,
    userLocale: 'de-DE',
    agentConfig: {
      id: 'test',
      name: 'Test',
      model: 'mistral',
      provider: 'mistral',
      params: { max_tokens: 2000 },
    } as any,
    searchQuery: 'Verkehrswende in Kommunen',
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

describe('searchRespondNode', () => {
  it('returns fallback message when no search results', async () => {
    const state = makeState({ searchResults: [] });
    const result = await searchRespondNode(state);

    expect(result.responseText).toContain('keine relevanten Ergebnisse');
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('builds web mode system message with XML formatting', async () => {
    const state = makeState({
      searchResults: [
        {
          source: 'web',
          title: 'Test Article',
          content: 'This is test content about Verkehrswende.',
          url: 'https://example.com',
          relevance: 0.8,
        },
        {
          source: 'gruenerator:deutschland',
          title: 'Grundsatzprogramm',
          content: 'Grüne Position zur Mobilität.',
          url: 'https://gruene.de/mobil',
          relevance: 0.7,
        },
      ],
    });

    const result = await searchRespondNode(state);

    // Should contain XML-formatted results
    expect(result.responseText).toContain('<quelle nr="1"');
    expect(result.responseText).toContain('<quelle nr="2"');
    expect(result.responseText).toContain('</quelle>');
    expect(result.responseText).toContain('<suchergebnisse');

    // Should contain quality requirements
    expect(result.responseText).toContain('Mindestens 400 Wörter');
    expect(result.responseText).toContain('Jeder Satz');
    expect(result.responseText).toContain('JEDE Aussage');

    // Should contain citation rules
    expect(result.responseText).toContain('[1]');
    expect(result.responseText).toContain('[2]');
    expect(result.responseText).toContain('GENAU 2 Quellen');
  });

  it('builds deep mode system message with dossier structure', async () => {
    const state = makeState({
      searchMode: 'deep',
      searchResults: [
        {
          source: 'web',
          title: 'Deep Result',
          content: 'Deep content.',
          url: 'https://example.com',
          relevance: 0.9,
        },
      ],
    });

    const result = await searchRespondNode(state);

    expect(result.responseText).toContain('Mindestens 1500 Wörter');
    expect(result.responseText).toContain('Forschungsbericht');
    expect(result.responseText).toContain('Zusammenfassung');
    expect(result.responseText).toContain('Hintergrund');
    expect(result.responseText).toContain('Analyse');
    expect(result.responseText).toContain('Fazit');
  });

  it('prioritizes crawled content with higher budget', async () => {
    const state = makeState({
      searchResults: [
        {
          source: 'web',
          title: 'Crawled Article',
          content: 'short snippet',
          url: 'https://crawled.com',
          relevance: 0.8,
        },
        {
          source: 'web',
          title: 'Not Crawled',
          content: 'another snippet',
          url: 'https://other.com',
          relevance: 0.8,
        },
      ],
      enrichedResults: [
        {
          url: 'https://crawled.com',
          title: 'Crawled Article',
          content: 'short snippet',
          snippet: 'short',
          crawled: true,
          fullContent: 'This is the full crawled content of the article. '.repeat(50),
        },
      ],
    });

    const result = await searchRespondNode(state);

    // Crawled content should be extracted and present (not just the snippet)
    expect(result.responseText).toContain('full crawled content');
    // Non-crawled should still be there
    expect(result.responseText).toContain('another snippet');
  });

  it('escapes XML special characters in titles', async () => {
    const state = makeState({
      searchResults: [
        {
          source: 'web',
          title: 'Test & Demo <Article>',
          content: 'Content.',
          url: 'https://example.com',
          relevance: 0.8,
        },
      ],
    });

    const result = await searchRespondNode(state);

    expect(result.responseText).toContain('Test &amp; Demo &lt;Article&gt;');
    expect(result.responseText).not.toContain('Test & Demo <Article>');
  });

  it('localizes party name for de-AT locale', async () => {
    const state = makeState({
      userLocale: 'de-AT',
      searchResults: [
        {
          source: 'web',
          title: 'Test',
          content: 'Content.',
          url: 'https://example.com',
          relevance: 0.8,
        },
      ],
    });

    const result = await searchRespondNode(state);

    expect(result.responseText).toContain('Grüne Alternative');
  });

  it('limits results to MAX_SEARCH_RESULTS (10)', async () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      source: 'web',
      title: `Result ${i + 1}`,
      content: `Content for result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      relevance: 0.9 - i * 0.05,
    }));

    const state = makeState({ searchResults: results });
    const result = await searchRespondNode(state);

    expect(result.responseText).toContain('<quelle nr="10"');
    expect(result.responseText).not.toContain('<quelle nr="11"');
    expect(result.responseText).toContain('GENAU 10 Quellen');
  });
});
