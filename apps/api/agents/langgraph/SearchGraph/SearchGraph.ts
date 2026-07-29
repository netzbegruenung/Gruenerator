/**
 * SearchGraph — state initialisation for the /api/search-graph pipeline.
 *
 * The compiled LangGraph that used to live here (`searchGraph`), its state
 * annotation and its routing functions were dead: `runSearchGraph()` and
 * `searchGraph.invoke()` had ZERO production callers. The mounted router
 * (`routes/search/searchGraphContractRouter.ts`) calls the node functions
 * one by one so it can stream SSE between them.
 *
 * What remains is `initializeSearchState`, which that router does use. It now
 * returns `SearchGraphState` from ./types.js directly rather than the
 * annotation-derived type.
 */

import { getAllCollectionIds } from '../../../config/notebookCollectionMap.js';
import { getDefaultAgentId, getAgent } from '../../../routes/chat/agents/agentLoader.js';

import type { SearchGraphInput, SearchGraphState, UserLocale } from './types.js';

/**
 * Initialize search state from input.
 */
export async function initializeSearchState(input: SearchGraphInput): Promise<SearchGraphState> {
  const agentConfig = await getAgent(getDefaultAgentId());

  if (!agentConfig) {
    throw new Error('Default agent not found');
  }

  // Extract query from messages or input
  const lastMessage = input.messages?.[input.messages.length - 1];
  const query =
    input.query || (typeof lastMessage?.content === 'string' ? lastMessage.content : '');

  return {
    messages: input.messages || [{ role: 'user', content: query }],
    threadId: input.threadId || null,
    searchMode: input.searchMode,
    aiWorkerPool: input.aiWorkerPool,
    userLocale: (input.userLocale || input.locale || 'de-DE') as UserLocale,
    agentConfig,

    searchQuery: query,
    subQueries: null,
    hasTemporal: false,
    complexity: input.searchMode === 'deep' ? 'complex' : 'simple',
    queryType: 'general',

    intent: 'search',
    searchSources: ['documents', 'web'],
    notebookCollectionIds: getAllCollectionIds(),
    defaultNotebookCollectionIds: [],
    detectedFilters: null,
    enabledTools: { search: true, web: true, research: true },

    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: input.searchMode === 'deep' ? 3 : 2,

    qualityScore: 0,
    qualityAssessmentTimeMs: 0,

    webSearchBatches: [],
    crawlDecisions: [],
    enrichedResults: [],
    categorizedSources: null,
    crawlMetadata: null,
    searchOptions: { maxResults: 10, language: 'de-DE' },

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
  };
}
