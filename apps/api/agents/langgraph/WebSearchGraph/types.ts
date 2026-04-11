/**
 * Type definitions for WebSearchGraph
 * Defines state interfaces for the LangGraph search workflow
 */

import { type AIWorkerPool } from '../../../workers/types.js';

import type {
  Citation,
  ValidationResult,
  Source,
  ReferencesMap,
  ReferenceData,
} from '../../../services/search/types.js';
import type { Request } from 'express';

// Re-export for external use
export type { Citation, ValidationResult, Source, ReferencesMap, ReferenceData };

/**
 * Search result from web search providers
 */
export interface SearchResult {
  url: string;
  title: string;
  content: string;
  snippet: string;
  domain?: string | undefined;
  score?: number | undefined;
  [key: string]: unknown;
}

/**
 * Web search batch result
 */
export interface WebSearchBatch {
  query: string;
  results: SearchResult[];
  provider: 'searxng' | 'mistral';
  success: boolean;
  error?: string | undefined;
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
  crawled?: boolean | undefined;
  fullContent?: string | undefined;
  keyParagraphs?: string | undefined;
  crawlError?: string | undefined;
}

/**
 * Categorized sources
 */
export interface CategorizedSources {
  official?: SearchResult[] | undefined;
  news?: SearchResult[] | undefined;
  academic?: SearchResult[] | undefined;
  other?: SearchResult[] | undefined;
  [key: string]: SearchResult[] | undefined;
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
  grundsatzPosition?: string | undefined;
  recommendations?: string | undefined;
}

/**
 * Search options for configuring search behavior
 */
export interface SearchOptions {
  maxResults?: number | undefined;
  language?: string | undefined;
  engines?: string[] | undefined;
  categories?: string; // Comma-separated string (e.g., 'general,news') - matches SearxngSearchOptions
  time_range?: string | undefined;
  safesearch?: number | undefined;
}

/**
 * Crawl metadata
 */
export interface CrawlMetadata {
  // Core metrics
  totalUrls?: number | undefined;
  crawledUrls?: number | undefined;
  skippedUrls?: number | undefined;
  failedUrls?: number | undefined;
  strategy?: string | undefined;

  // Operational properties used by nodes
  crawledCount?: number; // ContentEnricherNode: successful crawl count
  totalResultsAnalyzed?: number; // IntelligentCrawlerNode: analyzed result count
  maxCrawlsAllowed?: number; // IntelligentCrawlerNode: max crawl limit
  selectedCount?: number; // IntelligentCrawlerNode: selected URLs count
  timeout?: number; // ContentEnricherNode: crawl timeout value
  failed?: boolean; // Error flags for crawl failures
  noResultsToAnalyze?: boolean; // IntelligentCrawlerNode: no results flag
  emptyResults?: boolean; // IntelligentCrawlerNode: empty results flag
  nothingToCrawl?: boolean; // ContentEnricherNode: no crawl decisions flag
}

/**
 * Search metadata
 */
export interface SearchMetadata {
  startTime?: number | undefined;
  searchMode?: string | undefined;
  planningStrategy?: string | undefined;
  queryOptimization?: boolean | undefined;
  generatedQuestions?: number | undefined;
  searchType?: string | undefined;
  duration?: number | undefined;
  totalResults?: number | undefined;
  hasOfficialPosition?: boolean | undefined;
  citationsEnabled?: boolean | undefined;
  errorOccurred?: boolean | undefined;
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
  aiWorkerPool: AIWorkerPool;
  req: Request;

  // Intermediate state
  subqueries?: string[] | undefined;
  webResults?: WebSearchBatch[] | undefined;
  grundsatzResults?: GrundsatzResult | null | undefined;
  aggregatedResults?: SearchResult[] | undefined;
  categorizedSources?: CategorizedSources | undefined;

  // Citation support
  referencesMap?: ReferencesMap | undefined;
  citations?: Citation[] | undefined;
  citationSources?: Source[] | undefined;

  // Intelligent crawling support
  crawlDecisions?: CrawlDecision[] | undefined;
  enrichedResults?: EnrichedResult[] | undefined;
  crawlMetadata?: CrawlMetadata | undefined;

  // Output
  finalResults?: SearchResult[] | undefined;
  summary?: string | undefined;
  dossier?: ResearchDossier | null | undefined;
  metadata: SearchMetadata;
  success?: boolean | undefined;
  error?: string | undefined;
}

/**
 * Input parameters for runWebSearch
 */
export interface WebSearchInput {
  query: string;
  mode?: 'normal' | 'deep' | undefined;
  user_id?: string | undefined;
  searchOptions?: SearchOptions | undefined;
  aiWorkerPool: AIWorkerPool;
  req: Request;
}

/**
 * Normal mode search output
 */
export interface NormalSearchOutput {
  status: 'success' | 'error';
  query: string;
  results: SearchResult[];
  summary?: string | undefined;
  citations: Citation[];
  citationSources: Source[];
  metadata: SearchMetadata;
  message?: string | undefined;
  error?: string | undefined;
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
  message?: string | undefined;
  error?: string | undefined;
}

/**
 * Union type for search output
 */
export type WebSearchOutput = NormalSearchOutput | DeepSearchOutput;
