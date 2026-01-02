/**
 * Type definitions for WebSearchGraph
 * Defines state interfaces for the LangGraph search workflow
 */

import type {
  Citation,
  ValidationResult,
  Source,
  ReferencesMap,
  ReferenceData
} from '../../../services/search/types.js';

// Re-export for external use
export type {
  Citation,
  ValidationResult,
  Source,
  ReferencesMap,
  ReferenceData
};

/**
 * Search result from web search providers
 */
export interface SearchResult {
  url: string;
  title: string;
  content: string;
  snippet: string;
  domain?: string;
  score?: number;
}

/**
 * Web search batch result
 */
export interface WebSearchBatch {
  query: string;
  results: SearchResult[];
  provider: 'searxng' | 'mistral';
  success: boolean;
  error?: string;
}

/**
 * Grundsatz search result
 */
export interface GrundsatzResult {
  success: boolean;
  results: SearchResult[];
  source: 'grundsatz' | 'documents';
}

/**
 * Crawl decision for a URL
 */
export interface CrawlDecision {
  url: string;
  shouldCrawl: boolean;
  reason: string;
  priority: number;
}

/**
 * Enriched result with crawled content
 */
export interface EnrichedResult extends SearchResult {
  crawled?: boolean;
  fullContent?: string;
  keyParagraphs?: string;
  crawlError?: string;
}

/**
 * Categorized sources
 */
export interface CategorizedSources {
  official?: SearchResult[];
  news?: SearchResult[];
  academic?: SearchResult[];
  other?: SearchResult[];
}

/**
 * Deep research dossier
 */
export interface ResearchDossier {
  query: string;
  executiveSummary: string;
  detailedAnalysis: string;
  methodology: string;
  sources: SearchResult[];
  grundsatzPosition?: string;
  recommendations?: string;
}

/**
 * Search options for configuring search behavior
 */
export interface SearchOptions {
  maxResults?: number;
  language?: string;
  engines?: string[];
  categories?: string; // Comma-separated string (e.g., 'general,news') - matches SearxngSearchOptions
  time_range?: string;
  safesearch?: number;
}

/**
 * Crawl metadata
 */
export interface CrawlMetadata {
  // Core metrics
  totalUrls?: number;
  crawledUrls?: number;
  skippedUrls?: number;
  failedUrls?: number;
  strategy?: string;

  // Operational properties used by nodes
  crawledCount?: number;          // ContentEnricherNode: successful crawl count
  totalResultsAnalyzed?: number;  // IntelligentCrawlerNode: analyzed result count
  maxCrawlsAllowed?: number;      // IntelligentCrawlerNode: max crawl limit
  selectedCount?: number;         // IntelligentCrawlerNode: selected URLs count
  timeout?: number;               // ContentEnricherNode: crawl timeout value
  failed?: boolean;               // Error flags for crawl failures
  noResultsToAnalyze?: boolean;   // IntelligentCrawlerNode: no results flag
  emptyResults?: boolean;         // IntelligentCrawlerNode: empty results flag
  nothingToCrawl?: boolean;       // ContentEnricherNode: no crawl decisions flag
}

/**
 * Search metadata
 */
export interface SearchMetadata {
  startTime?: number;
  searchMode?: string;
  planningStrategy?: string;
  queryOptimization?: boolean;
  generatedQuestions?: number;
  searchType?: string;
  duration?: number;
  totalResults?: number;
  hasOfficialPosition?: boolean;
  citationsEnabled?: boolean;
  errorOccurred?: boolean;
  [key: string]: unknown;
}

/**
 * Main search state for LangGraph
 * This matches the Annotation.Root structure in the original file
 */
export interface WebSearchState {
  // Input parameters
  query: string;
  mode: 'normal' | 'deep';
  user_id: string;
  searchOptions: SearchOptions;
  aiWorkerPool: any;
  req: any; // Express request object

  // Intermediate state
  subqueries?: string[];
  webResults?: WebSearchBatch[];
  grundsatzResults?: GrundsatzResult | null;
  aggregatedResults?: SearchResult[];
  categorizedSources?: CategorizedSources;

  // Citation support
  referencesMap?: ReferencesMap;
  citations?: Citation[];
  citationSources?: Source[];

  // Intelligent crawling support
  crawlDecisions?: CrawlDecision[];
  enrichedResults?: EnrichedResult[];
  crawlMetadata?: CrawlMetadata;

  // Output
  finalResults?: SearchResult[];
  summary?: string;
  dossier?: ResearchDossier | null;
  metadata: SearchMetadata;
  success?: boolean;
  error?: string;
}

/**
 * Input parameters for runWebSearch
 */
export interface WebSearchInput {
  query: string;
  mode?: 'normal' | 'deep';
  user_id?: string;
  searchOptions?: SearchOptions;
  aiWorkerPool: any;
  req: any;
}

/**
 * Normal mode search output
 */
export interface NormalSearchOutput {
  status: 'success' | 'error';
  query: string;
  results: SearchResult[];
  summary?: string;
  citations: Citation[];
  citationSources: Source[];
  metadata: SearchMetadata;
  message?: string;
  error?: string;
}

/**
 * Deep research mode output
 */
export interface DeepSearchOutput {
  status: 'success' | 'error';
  dossier: ResearchDossier | null;
  researchQuestions: string[];
  searchResults: WebSearchBatch[];
  sources: SearchResult[];
  categorizedSources: CategorizedSources;
  grundsatzResults: GrundsatzResult | null;
  citations: Citation[];
  citationSources: Source[];
  metadata: SearchMetadata;
  message?: string;
  error?: string;
}

/**
 * Union type for search output
 */
export type WebSearchOutput = NormalSearchOutput | DeepSearchOutput;
