/**
 * Tests for the Persistent Default Notebook Selection feature.
 *
 * Covers:
 * 1. Pure functions: resolveNotebookCollections, isKnownNotebook, getDefaultCollectionsForLocale
 * 2. searchNode() with mocked services — verifies the 5-level collection priority chain
 * 3. Default behavior equivalence (gruenerator-notebook ≡ de-DE locale fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external services BEFORE any imports that use them ─────────────

const mockExecuteDirectSearch = vi.fn();
const mockExecuteDirectWebSearch = vi.fn();
const mockExecuteDirectExamplesSearch = vi.fn();
const mockExecuteResearch = vi.fn();

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectSearch: (...args: any[]) => mockExecuteDirectSearch(...args),
  executeDirectWebSearch: (...args: any[]) => mockExecuteDirectWebSearch(...args),
  executeDirectExamplesSearch: (...args: any[]) => mockExecuteDirectExamplesSearch(...args),
  executeResearch: (...args: any[]) => mockExecuteResearch(...args),
}));

const mockSelectAndCrawlTopUrls = vi.fn();
vi.mock('../../../../services/search/CrawlingService.js', () => ({
  selectAndCrawlTopUrls: (...args: any[]) => mockSelectAndCrawlTopUrls(...args),
}));

const mockExpandQuery = vi.fn();
vi.mock('../../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: (...args: any[]) => mockExpandQuery(...args),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Import modules under test (after mocks) ────────────────────────────

import {
  resolveNotebookCollections,
  isKnownNotebook,
  NOTEBOOK_COLLECTION_MAP,
} from '../../../../config/notebookCollectionMap.js';
import { searchNode, getDefaultCollectionsForLocale, buildCitations } from './searchNode.js';
import type { ChatGraphState, SearchResult } from '../types.js';
import type { AgentConfig } from '../../../../routes/chat/agents/types.js';

// ─── Test helpers ────────────────────────────────────────────────────────

function makeDirectSearchResult(
  collection: string,
  results: Array<{ source: string; excerpt: string; url?: string; relevance?: string }>
) {
  return { collection, results };
}

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'gruenerator-universal',
    name: 'Universal',
    description: 'Test agent',
    systemRole: 'Du bist ein Testassistent.',
    model: 'mistral-small-latest',
    params: { max_tokens: 2048, temperature: 0.7 },
    ...overrides,
  } as AgentConfig;
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [],
    threadId: null,
    agentConfig: makeAgentConfig(),
    enabledTools: { search: true },
    aiWorkerPool: null,
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    intent: 'search',
    searchSources: [],
    searchQuery: 'Klimapolitik',
    subQueries: null,
    reasoning: 'test',
    hasTemporal: false,
    complexity: 'simple',
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
    responseText: '',
    streamingStarted: false,
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
 * Extract the unique collection names from all executeDirectSearch calls.
 */
function getSearchedCollections(): string[] {
  return [...new Set(mockExecuteDirectSearch.mock.calls.map((call: any[]) => call[0].collection))];
}

// ─── resolveNotebookCollections ─────────────────────────────────────────

describe('resolveNotebookCollections', () => {
  it('resolves gruenerator-notebook to 4 default German collections', () => {
    const result = resolveNotebookCollections(['gruenerator-notebook']);
    expect(result).toEqual(['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki']);
  });

  it('resolves hamburg-notebook to hamburg collection', () => {
    const result = resolveNotebookCollections(['hamburg-notebook']);
    expect(result).toEqual(['hamburg']);
  });

  it('resolves multiple notebooks and deduplicates', () => {
    const result = resolveNotebookCollections(['gruene-notebook', 'bundestagsfraktion-notebook']);
    expect(result).toContain('deutschland');
    expect(result).toContain('bundestagsfraktion');
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns empty array for unknown notebook IDs', () => {
    expect(resolveNotebookCollections(['nonexistent-notebook'])).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(resolveNotebookCollections([])).toEqual([]);
  });
});

// ─── isKnownNotebook ────────────────────────────────────────────────────

describe('isKnownNotebook', () => {
  it('returns true for all known notebook IDs', () => {
    for (const id of Object.keys(NOTEBOOK_COLLECTION_MAP)) {
      expect(isKnownNotebook(id)).toBe(true);
    }
  });

  it('returns false for unknown notebook IDs', () => {
    expect(isKnownNotebook('nonexistent-notebook')).toBe(false);
    expect(isKnownNotebook('')).toBe(false);
    expect(isKnownNotebook('deutschland')).toBe(false);
  });
});

// ─── getDefaultCollectionsForLocale ─────────────────────────────────────

describe('getDefaultCollectionsForLocale', () => {
  it('returns German collections for de-DE', () => {
    expect(getDefaultCollectionsForLocale('de-DE')).toEqual([
      'deutschland',
      'bundestagsfraktion',
      'gruene-de',
      'kommunalwiki',
    ]);
  });

  it('returns Austrian collections for de-AT', () => {
    expect(getDefaultCollectionsForLocale('de-AT')).toEqual(['oesterreich', 'gruene-at']);
  });

  it('falls back to German for undefined locale', () => {
    expect(getDefaultCollectionsForLocale(undefined)).toEqual(
      getDefaultCollectionsForLocale('de-DE')
    );
  });

  it('falls back to German for unknown locale', () => {
    expect(getDefaultCollectionsForLocale('en-US')).toEqual(
      getDefaultCollectionsForLocale('de-DE')
    );
  });
});

// ─── searchNode: full service mock tests ─────────────────────────────────

describe('searchNode – collection priority chain (mocked services)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: executeDirectSearch returns realistic results
    mockExecuteDirectSearch.mockImplementation(async ({ collection }: { collection: string }) =>
      makeDirectSearchResult(collection, [
        {
          source: 'Grüne Klimapolitik',
          excerpt: 'Die Grünen setzen auf Klimaneutralität bis 2035.',
          url: `https://example.com/${collection}/1`,
          relevance: 'Sehr hoch',
        },
        {
          source: 'Energiewende',
          excerpt: 'Der Ausbau erneuerbarer Energien ist zentral.',
          url: `https://example.com/${collection}/2`,
          relevance: 'Hoch',
        },
      ])
    );
  });

  it('priority 5 (lowest): uses locale fallback when nothing else set', async () => {
    const result = await searchNode(makeState());

    const collections = getSearchedCollections();
    expect(collections).toEqual(
      expect.arrayContaining(['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'])
    );
    expect(collections).toHaveLength(4);
    expect(result.searchResults!.length).toBeGreaterThan(0);
  });

  it('priority 5: de-AT locale searches Austrian collections', async () => {
    const result = await searchNode(makeState({ userLocale: 'de-AT' }));

    const collections = getSearchedCollections();
    expect(collections).toEqual(expect.arrayContaining(['oesterreich', 'gruene-at']));
    expect(collections).toHaveLength(2);
  });

  it('priority 4: defaultNotebookCollectionIds overrides locale fallback', async () => {
    const result = await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const collections = getSearchedCollections();
    expect(collections).toEqual(['hamburg']);
    expect(result.searchResults!.length).toBeGreaterThan(0);
  });

  it('priority 4: multiple default notebook collections searched in parallel', async () => {
    await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg', 'bayern'],
      })
    );

    const collections = getSearchedCollections();
    expect(collections).toEqual(expect.arrayContaining(['hamburg', 'bayern']));
    expect(collections).toHaveLength(2);
  });

  it('priority 3: agent defaultCollection overrides defaultNotebookCollectionIds', async () => {
    await searchNode(
      makeState({
        agentConfig: makeAgentConfig({
          toolRestrictions: { defaultCollection: 'oesterreich' },
        }),
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const collections = getSearchedCollections();
    expect(collections).toContain('oesterreich');
    expect(collections).not.toContain('hamburg');
  });

  it('priority 2: agent allowedCollections overrides defaultNotebookCollectionIds', async () => {
    await searchNode(
      makeState({
        agentConfig: makeAgentConfig({
          toolRestrictions: { allowedCollections: ['bayern', 'thueringen'] },
        }),
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const collections = getSearchedCollections();
    expect(collections).toEqual(expect.arrayContaining(['bayern', 'thueringen']));
    expect(collections).not.toContain('hamburg');
  });

  it('priority 1 (highest): @mention notebookCollectionIds overrides everything', async () => {
    await searchNode(
      makeState({
        notebookCollectionIds: ['schleswig-holstein'],
        agentConfig: makeAgentConfig({
          toolRestrictions: { allowedCollections: ['bayern'] },
        }),
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const collections = getSearchedCollections();
    expect(collections).toEqual(['schleswig-holstein']);
  });

  it('returns citations built from search results', async () => {
    const result = await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    expect(result.citations).toBeDefined();
    expect(result.citations!.length).toBeGreaterThan(0);
    expect(result.citations![0]).toMatchObject({
      id: expect.any(Number),
      title: expect.any(String),
      url: expect.stringContaining('hamburg'),
    });
  });

  it('deduplicates results by URL across collections', async () => {
    // Both collections return the same URL
    mockExecuteDirectSearch.mockImplementation(async ({ collection }: { collection: string }) =>
      makeDirectSearchResult(collection, [
        {
          source: 'Shared Article',
          excerpt: 'Shared content across collections.',
          url: 'https://example.com/shared',
          relevance: 'Sehr hoch',
        },
      ])
    );

    const result = await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg', 'bayern'],
      })
    );

    const urls = result.searchResults!.map((r: SearchResult) => r.url).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('handles service failure gracefully', async () => {
    mockExecuteDirectSearch.mockRejectedValue(new Error('Qdrant connection refused'));

    const result = await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    expect(result.searchResults).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('tracks searched collections in result metadata', async () => {
    const result = await searchNode(
      makeState({
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    expect(result.searchedCollections).toEqual(['hamburg']);
  });
});

// ─── searchNode: multi-source parallel search ────────────────────────────

describe('searchNode – multi-source with defaultNotebookCollectionIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExecuteDirectSearch.mockImplementation(async ({ collection }: { collection: string }) =>
      makeDirectSearchResult(collection, [
        {
          source: 'Doc result',
          excerpt: 'Document search result.',
          url: `https://gruene.de/${collection}/result`,
          relevance: 'Hoch',
        },
      ])
    );

    mockExecuteDirectWebSearch.mockResolvedValue({
      results: [
        { title: 'Web Result', snippet: 'Web content.', url: 'https://web.example.com/1', rank: 1 },
      ],
    });

    mockExpandQuery.mockResolvedValue({ alternatives: [] });
    mockSelectAndCrawlTopUrls.mockImplementation(async (results: any[]) =>
      results.map((r: any) => ({ ...r, crawled: false }))
    );
  });

  it('uses defaultNotebookCollectionIds for document source in multi-source mode', async () => {
    await searchNode(
      makeState({
        searchSources: ['documents', 'web'],
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const docCollections = getSearchedCollections();
    expect(docCollections).toEqual(['hamburg']);
    expect(mockExecuteDirectWebSearch).toHaveBeenCalled();
  });

  it('notebookCollectionIds overrides defaultNotebookCollectionIds in multi-source', async () => {
    await searchNode(
      makeState({
        searchSources: ['documents', 'web'],
        notebookCollectionIds: ['bayern'],
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const docCollections = getSearchedCollections();
    expect(docCollections).toEqual(['bayern']);
  });

  it('merges document and web results in multi-source mode', async () => {
    const result = await searchNode(
      makeState({
        searchSources: ['documents', 'web'],
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    const sources = result.searchResults!.map((r: SearchResult) => r.source);
    expect(sources).toContain('gruenerator:hamburg');
    expect(sources).toContain('web');
  });
});

// ─── searchNode: web intent (no collection priority) ─────────────────────

describe('searchNode – web intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExecuteDirectWebSearch.mockResolvedValue({
      results: [
        {
          title: 'Aktuelle Nachrichten',
          snippet: 'Klimagipfel 2026.',
          url: 'https://news.example.com/1',
          rank: 1,
        },
        {
          title: 'Energiewende aktuell',
          snippet: 'Neue Windparks.',
          url: 'https://news.example.com/2',
          rank: 2,
        },
      ],
    });

    mockExpandQuery.mockResolvedValue({ alternatives: ['Klimapolitik aktuell'] });
    mockSelectAndCrawlTopUrls.mockImplementation(async (results: any[]) =>
      results.map((r: any) => ({ ...r, crawled: false }))
    );
  });

  it('web intent does not use defaultNotebookCollectionIds', async () => {
    await searchNode(
      makeState({
        intent: 'web',
        defaultNotebookCollectionIds: ['hamburg'],
      })
    );

    expect(mockExecuteDirectSearch).not.toHaveBeenCalled();
    expect(mockExecuteDirectWebSearch).toHaveBeenCalled();
  });

  it('expands query for web search', async () => {
    await searchNode(makeState({ intent: 'web' }));

    expect(mockExpandQuery).toHaveBeenCalledWith('Klimapolitik', null);
    // Original + expanded variant = 2 web searches
    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
  });
});

// ─── Default behavior equivalence ───────────────────────────────────────

describe('default behavior equivalence', () => {
  it('gruenerator-notebook resolves to same collections as de-DE locale fallback', () => {
    const fromNotebook = resolveNotebookCollections(['gruenerator-notebook']);
    const fromLocale = getDefaultCollectionsForLocale('de-DE');
    expect(fromNotebook).toEqual(fromLocale);
  });

  it('oesterreich-notebook resolves to subset of de-AT locale fallback', () => {
    const fromNotebook = resolveNotebookCollections(['oesterreich-notebook']);
    const fromLocale = getDefaultCollectionsForLocale('de-AT');
    expect(fromLocale).toEqual(expect.arrayContaining(fromNotebook));
  });
});

// ─── buildCitations ─────────────────────────────────────────────────────

describe('buildCitations', () => {
  it('builds citations from search results with URLs', () => {
    const results: SearchResult[] = [
      {
        source: 'gruenerator:hamburg',
        title: 'Hamburg Klima',
        content: 'Hamburger Klimaplan...',
        url: 'https://hamburg.de/klima',
        relevance: 0.9,
      },
      {
        source: 'gruenerator:hamburg',
        title: 'Hamburg Verkehr',
        content: 'Mobilitätswende...',
        url: 'https://hamburg.de/verkehr',
        relevance: 0.7,
      },
    ];

    const citations = buildCitations(results);
    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      id: 1,
      title: 'Hamburg Klima',
      url: 'https://hamburg.de/klima',
    });
  });

  it('skips results without URLs', () => {
    const results: SearchResult[] = [
      {
        source: 'research_synthesis',
        title: 'Summary',
        content: 'Zusammenfassung...',
        relevance: 1.0,
      },
      {
        source: 'gruenerator:hamburg',
        title: 'Hamburg',
        content: 'Content',
        url: 'https://hamburg.de/1',
        relevance: 0.8,
      },
    ];

    const citations = buildCitations(results);
    expect(citations).toHaveLength(1);
    expect(citations[0].url).toBe('https://hamburg.de/1');
  });

  it('limits to 8 citations', () => {
    const results: SearchResult[] = Array.from({ length: 12 }, (_, i) => ({
      source: 'gruenerator:deutschland',
      title: `Result ${i}`,
      content: `Content ${i}`,
      url: `https://example.com/${i}`,
      relevance: 1 - i * 0.05,
    }));

    const citations = buildCitations(results);
    expect(citations).toHaveLength(8);
  });
});
