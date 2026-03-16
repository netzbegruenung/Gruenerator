/**
 * SearchGraph — Perplexity-Class Search Pipeline
 *
 * A focused graph that ALWAYS searches — no classifier needed.
 * Supports two modes:
 * - web: query plan → parallel search → intelligent crawl → rerank → respond
 * - deep: research questions → full crawl pipeline → rerank → dossier
 *
 * Graph flow:
 *   START → queryPlanner → [searchExecutor → intelligentCrawl | deepResearch] → rerank → qualityGate → searchRespond → suggestFollowUps → END
 *
 * Reuses nodes from ChatGraph (rerank, qualityGate) and WebSearchGraph (planner, searxng, crawler, enricher, aggregator).
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';

import { getDefaultAgentId, getAgent } from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';
import { qualityGateNode } from '../ChatGraph/nodes/qualityGateNode.js';
import { rerankNode } from '../ChatGraph/nodes/rerankNode.js';

import { deepResearchNode } from './nodes/deepResearchNode.js';
import { intelligentCrawlNode } from './nodes/intelligentCrawlNode.js';
import { queryPlannerNode } from './nodes/queryPlannerNode.js';
import { searchExecutorNode } from './nodes/searchExecutorNode.js';
import { searchRespondNode } from './nodes/searchRespondNode.js';
import { suggestFollowUpsNode } from './nodes/suggestFollowUpsNode.js';

// Reused from ChatGraph

import type {
  SearchGraphInput,
  SearchGraphOutput,
  SearchMode,
  ChatSearchResult,
  ChatCitation,
  SearchSource,
  UserLocale,
} from './types.js';
import type { SubcategoryFilters } from '../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type {
  WebSearchBatch,
  CrawlDecision,
  EnrichedResult,
  CategorizedSources,
  CrawlMetadata,
  SearchOptions,
} from '../WebSearchGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('SearchGraph');

/**
 * State annotation for the SearchGraph.
 * Defines how each field is updated when nodes return partial state.
 */
const SearchStateAnnotation = Annotation.Root({
  // Input
  messages: Annotation<ModelMessage[]>({
    reducer: (x, y) => y ?? x,
  }),
  threadId: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  searchMode: Annotation<SearchMode>({
    reducer: (x, y) => y ?? x,
  }),
  aiWorkerPool: Annotation<AIWorkerPool>({
    reducer: (x, y) => y ?? x,
  }),
  userLocale: Annotation<UserLocale>({
    reducer: (x, y) => y ?? x,
  }),
  agentConfig: Annotation<AgentConfig>({
    reducer: (x, y) => y ?? x,
  }),

  // Query optimization
  searchQuery: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  subQueries: Annotation<string[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  hasTemporal: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  complexity: Annotation<'simple' | 'moderate' | 'complex'>({
    reducer: (x, y) => y ?? x ?? 'simple',
  }),
  queryType: Annotation<string>({
    reducer: (x, y) => y ?? x ?? 'general',
  }),

  // Search scoping (needed by reused nodes)
  intent: Annotation<'search' | 'web'>({
    reducer: (x, y) => y ?? x,
  }),
  searchSources: Annotation<SearchSource[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  notebookCollectionIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  defaultNotebookCollectionIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  detectedFilters: Annotation<SubcategoryFilters | null>({
    reducer: (x, y) => y ?? x,
  }),
  enabledTools: Annotation<Record<string, boolean>>({
    reducer: (x, y) => y ?? x,
  }),

  // Search results — REPLACE semantics (same as ChatGraph)
  searchResults: Annotation<ChatSearchResult[]>({
    reducer: (x, y) => {
      if (y && y.length > 0) return y;
      return x || [];
    },
  }),
  citations: Annotation<ChatCitation[]>({
    reducer: (x, y) => {
      if (y && y.length > 0) return y;
      return x || [];
    },
  }),
  searchCount: Annotation<number>({
    reducer: (x, y) => (x || 0) + (y || 0),
  }),
  maxSearches: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 2,
  }),

  // Quality gate
  qualityScore: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  qualityAssessmentTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Deep research state
  webSearchBatches: Annotation<WebSearchBatch[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  crawlDecisions: Annotation<CrawlDecision[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  enrichedResults: Annotation<EnrichedResult[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  categorizedSources: Annotation<CategorizedSources | null>({
    reducer: (x, y) => y ?? x,
  }),
  crawlMetadata: Annotation<CrawlMetadata | null>({
    reducer: (x, y) => y ?? x,
  }),
  searchOptions: Annotation<SearchOptions>({
    reducer: (x, y) => y ?? x ?? {},
  }),

  // Response
  responseText: Annotation<string>({
    reducer: (x, y) => y ?? x ?? '',
  }),

  // Follow-up suggestions
  followUpSuggestions: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Metadata
  startTime: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  queryOptimizeTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  searchTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  crawlTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  rerankTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  searchedCollections: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  responseTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
});

type SearchState = typeof SearchStateAnnotation.State;

/**
 * Route after query optimization: web mode → searchExecutor, deep mode → deepResearch.
 */
function routeAfterPlanning(state: SearchState): 'searchExecutor' | 'deepResearch' {
  if (state.searchMode === 'deep') {
    log.info('[SearchGraph] Route: queryOptimizer → deepResearch');
    return 'deepResearch';
  }
  log.info('[SearchGraph] Route: queryOptimizer → searchExecutor');
  return 'searchExecutor';
}

/**
 * Route after quality gate: loop back or proceed to respond.
 */
function routeAfterQualityGate(state: SearchState): 'searchExecutor' | 'searchRespond' {
  const { qualityScore, searchCount, maxSearches } = state;

  if (qualityScore > 0 && qualityScore < 3 && searchCount < maxSearches) {
    log.info(
      `[SearchGraph] Route: qualityGate → searchExecutor (score: ${qualityScore}/5, search ${searchCount}/${maxSearches})`
    );
    return 'searchExecutor';
  }

  log.info(`[SearchGraph] Route: qualityGate → searchRespond (score: ${qualityScore}/5)`);
  return 'searchRespond';
}

/**
 * Create the SearchGraph.
 */
function createSearchGraph() {
  const graph = new StateGraph(SearchStateAnnotation)
    .addNode('queryPlanner', queryPlannerNode as any)
    .addNode('searchExecutor', searchExecutorNode as any)
    .addNode('intelligentCrawl', intelligentCrawlNode as any)
    .addNode('deepResearch', deepResearchNode as any)
    .addNode('rerank', rerankNode as any)
    .addNode('qualityGate', qualityGateNode as any)
    .addNode('searchRespond', searchRespondNode as any)
    .addNode('suggestFollowUps', suggestFollowUpsNode as any)

    // START → queryPlanner
    .addEdge('__start__', 'queryPlanner')

    // queryPlanner → conditional: web path or deep path
    .addConditionalEdges('queryPlanner', routeAfterPlanning, {
      searchExecutor: 'searchExecutor',
      deepResearch: 'deepResearch',
    })

    // Web path: search → crawl top URLs → rerank
    .addEdge('searchExecutor', 'intelligentCrawl')
    .addEdge('intelligentCrawl', 'rerank')

    // Deep path: full research pipeline → rerank
    .addEdge('deepResearch', 'rerank')

    // rerank → qualityGate
    .addEdge('rerank', 'qualityGate')

    // qualityGate → conditional: loop back to search or proceed to respond
    .addConditionalEdges('qualityGate', routeAfterQualityGate, {
      searchExecutor: 'searchExecutor',
      searchRespond: 'searchRespond',
    })

    // searchRespond → suggestFollowUps → END
    .addEdge('searchRespond', 'suggestFollowUps')
    .addEdge('suggestFollowUps', '__end__');

  return graph.compile();
}

export const searchGraph = createSearchGraph();

/**
 * Initialize search state from input.
 */
export async function initializeSearchState(input: SearchGraphInput): Promise<SearchState> {
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
    notebookCollectionIds: [],
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

/**
 * Run the SearchGraph and return the result.
 */
export async function runSearchGraph(input: SearchGraphInput): Promise<SearchGraphOutput> {
  log.info(`[SearchGraph] Starting search: mode=${input.searchMode}`);

  try {
    const initialState = await initializeSearchState(input);
    const result = await searchGraph.invoke(initialState);
    const totalTimeMs = Date.now() - result.startTime;

    log.info(
      `[SearchGraph] Complete: ${result.searchResults.length} results, ${result.followUpSuggestions.length} suggestions, ${totalTimeMs}ms`
    );

    return {
      success: !result.error,
      threadId: result.threadId,
      responseText: result.responseText,
      searchResults: result.searchResults,
      citations: result.citations,
      followUpSuggestions: result.followUpSuggestions,
      categorizedSources: result.categorizedSources,
      metadata: {
        searchMode: result.searchMode,
        searchCount: result.searchCount,
        totalTimeMs,
        queryOptimizeTimeMs: result.queryOptimizeTimeMs,
        searchTimeMs: result.searchTimeMs,
        rerankTimeMs: result.rerankTimeMs,
        searchedCollections: result.searchedCollections,
        responseTimeMs: result.responseTimeMs,
      },
      error: result.error || undefined,
    };
  } catch (error: unknown) {
    log.error('[SearchGraph] Execution error:', error);
    return {
      success: false,
      threadId: input.threadId || null,
      responseText: '',
      searchResults: [],
      citations: [],
      followUpSuggestions: [],
      categorizedSources: null,
      metadata: {
        searchMode: input.searchMode,
        searchCount: 0,
        totalTimeMs: 0,
        queryOptimizeTimeMs: 0,
        searchTimeMs: 0,
        rerankTimeMs: 0,
        searchedCollections: [],
        responseTimeMs: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
