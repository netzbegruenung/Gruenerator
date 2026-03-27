/**
 * SearchGraph Type Definitions
 *
 * State structure for the search-focused LangGraph pipeline.
 * This is a superset of the fields read by reused ChatGraph nodes
 * (rerankNode, qualityGateNode) and WebSearchGraph nodes, plus
 * search-specific additions (follow-up suggestions, sources preview).
 *
 * NOTE: req/res are NOT part of graph state — the controller handles HTTP.
 */

import type { SubcategoryFilters } from '../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type {
  SearchResult as ChatSearchResult,
  Citation as ChatCitation,
  SearchSource,
  UserLocale,
} from '../ChatGraph/types.js';
import type {
  WebSearchBatch,
  CrawlDecision,
  EnrichedResult,
  CategorizedSources,
  CrawlMetadata,
  SearchOptions,
} from '../WebSearchGraph/types.js';
import type { ModelMessage } from 'ai';

// Re-export shared types
export type { SearchSource, UserLocale, ChatSearchResult, ChatCitation };

/**
 * Search mode determines the pipeline depth.
 * - 'web': Hybrid document + web search with AI summary
 * - 'deep': Full research pipeline (plan → crawl → enrich → dossier)
 */
export type SearchMode = 'web' | 'deep';

/**
 * Query type classification for search strategy selection.
 */
export type QueryType = 'definitional' | 'comparative' | 'how-to' | 'news' | 'person' | 'general';

/**
 * SearchGraph state — shared by all nodes in the search pipeline.
 *
 * Fields are grouped by lifecycle stage:
 * 1. Input (set by controller, immutable during graph execution)
 * 2. Query optimization (set by queryOptimizer node)
 * 3. Search execution (set by searchExecutor/deepResearch nodes)
 * 4. Rerank & quality (set by reused ChatGraph nodes)
 * 5. Response generation (set by searchRespond node)
 * 6. Follow-up suggestions (set by suggestFollowUps node)
 * 7. Metadata (timing, observability)
 */
export interface SearchGraphState {
  // ── Input (immutable after initialization) ──
  messages: ModelMessage[];
  threadId: string | null;
  searchMode: SearchMode;
  aiWorkerPool: AIWorkerPool;
  userLocale: UserLocale;
  agentConfig: AgentConfig;

  // ── Query optimization ──
  searchQuery: string | null;
  subQueries: string[] | null;
  hasTemporal: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  queryType: QueryType;

  // ── Search scoping ──
  /** Override intent for ChatGraph search helpers. Always 'search' or 'web'. */
  intent: 'search' | 'web';
  searchSources: SearchSource[];
  notebookCollectionIds: string[];
  defaultNotebookCollectionIds: string[];
  detectedFilters: SubcategoryFilters | null;
  /** Enabled tools (needed by reused nodes, always all-true for search) */
  enabledTools: Record<string, boolean>;

  // ── Search results (shared with reused nodes) ──
  searchResults: ChatSearchResult[];
  citations: ChatCitation[];
  searchCount: number;
  maxSearches: number;

  // ── Quality gate ──
  qualityScore: number;
  qualityAssessmentTimeMs: number;

  // ── Deep research intermediate state ──
  webSearchBatches: WebSearchBatch[];
  crawlDecisions: CrawlDecision[];
  enrichedResults: EnrichedResult[];
  categorizedSources: CategorizedSources | null;
  crawlMetadata: CrawlMetadata | null;
  searchOptions: SearchOptions;

  // ── Response generation ──
  responseText: string;

  // ── Follow-up suggestions ──
  followUpSuggestions: string[];

  // ── Metadata ──
  startTime: number;
  queryOptimizeTimeMs: number;
  searchTimeMs: number;
  crawlTimeMs: number;
  rerankTimeMs: number;
  searchedCollections: string[];
  responseTimeMs: number;
  error: string | null;
}

/**
 * Input to create a SearchGraph session.
 * Provided by the controller when invoking the graph.
 */
export interface SearchGraphInput {
  query: string;
  messages?: ModelMessage[];
  threadId?: string;
  searchMode: SearchMode;
  aiWorkerPool: AIWorkerPool;
  userLocale?: UserLocale;
  locale?: string;
}

/**
 * Output from the SearchGraph after completion.
 */
export interface SearchGraphOutput {
  success: boolean;
  threadId: string | null;
  responseText: string;
  searchResults: ChatSearchResult[];
  citations: ChatCitation[];
  followUpSuggestions: string[];
  categorizedSources: CategorizedSources | null;
  metadata: {
    searchMode: SearchMode;
    searchCount: number;
    totalTimeMs: number;
    queryOptimizeTimeMs: number;
    searchTimeMs: number;
    rerankTimeMs: number;
    searchedCollections: string[];
    responseTimeMs: number;
  };
  error?: string;
}
