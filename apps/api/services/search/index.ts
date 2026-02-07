/**
 * Search Services - Barrel Exports
 * Provides unified access to all search-related services and utilities
 */

// Export SearXNG Service (singleton instance)
export { searxngService, default as SearxngServiceClass } from './SearxngService.js';

// Export SearchResultProcessor utilities
export {
  expandResultsToChunks,
  deduplicateResults,
  buildReferencesMap,
  validateAndInjectCitations,
  renumberCitationsInOrder,
  filterAndSortResults,
  groupSourcesByCollection,
  normalizeSearchResult,
  dedupeAndDiversify,
  summarizeReferencesForPrompt,
  parseAIJsonResponse,
} from './SearchResultProcessor.js';

// Export retry strategy and circuit breaker
export {
  withRetry,
  isRecoverableError,
  CircuitBreaker,
  searxngCircuit,
} from './searchRetryStrategy.js';
export type { RetryOptions } from './searchRetryStrategy.js';

// Export temporal analyzer
export { analyzeTemporality } from './TemporalAnalyzer.js';
export type { TemporalAnalysis, TemporalUrgency } from './TemporalAnalyzer.js';

// Export crawling service
export { selectAndCrawlTopUrls } from './CrawlingService.js';
export type { CrawlableResult, CrawledResult } from './CrawlingService.js';

// Export query expansion service
export { expandQuery } from './QueryExpansionService.js';
export type { ExpandedQuery } from './QueryExpansionService.js';

// Export diversity reranker (MMR)
export { applyMMR } from './DiversityReranker.js';

// Export citation grounder
export { validateCitations, stripUngroundedCitations } from './CitationGrounder.js';
export type { GroundingResult } from './CitationGrounder.js';

// Export all types
export type {
  // SearxngService types
  SearxngSearchOptions,
  SearchResult,
  ContentStats,
  FormattedSearchResults,
  FormattedSearchResultsWithSummary,
  SearxngSummary,
  ServiceStatus,

  // SearchResultProcessor types
  SearchResultInput,
  ExpandedChunkResult,
  ReferenceData,
  ReferencesMap,
  Citation,
  Source,
  ValidationResult,
  FilterOptions,
  DedupeOptions,
  CollectionConfig,
  CollectionSources,
  SourcesByCollection,
} from './types.js';
