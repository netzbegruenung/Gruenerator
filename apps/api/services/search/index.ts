/**
 * Search Services - Barrel Exports
 * Provides unified access to all search-related services and utilities
 */

// Export SearXNG Service (singleton instance)
export { searxngService, default as SearxngServiceClass } from './SearxngService.js';
export { type AIWorkerPool as SearxngAIWorkerPool } from './SearxngService.js';

// Export SearchResultProcessor utilities
export {
  expandResultsToChunks,
  deduplicateResults,
  buildReferencesMap,
  validateAndInjectCitations,
  renumberCitationsInOrder,
  filterAndSortResults,
  selectAcrossQueryGroups,
  sourceTextForPrompt,
  PROMPT_SOURCE_MAX_CHARS,
  groupSourcesByCollection,
  normalizeSearchResult,
  dedupeAndDiversify,
  summarizeReferencesForPrompt,
  parseAIJsonResponse,
} from './SearchResultProcessor.js';

// Export composite-question decomposition
export { splitCompositeQuestion } from './questionDecomposition.js';

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

// Export recency helpers (date-aware ranking + source-date formatting)
export {
  resolveSourceDate,
  recencyBoost,
  formatDe,
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_MAX_BOOST,
} from './recency.js';
export type { DateResolvable, RecencyBoostOptions, ResolveDateOptions } from './recency.js';

// Export crawling service
export { selectAndCrawlTopUrls, crawlAndDistill } from './CrawlingService.js';
export type {
  CrawlableResult,
  CrawledResult,
  DistilledCrawlResult,
  CrawlAndDistillOptions,
} from './CrawlingService.js';

// Export passage distillation
export { distillPassages } from './PassageDistiller.js';
export type { DistillMode, DistillResult, DistilledChunk } from './PassageDistiller.js';

// Export query expansion service
export { expandQuery } from './QueryExpansionService.js';
export type { ExpandedQuery } from './QueryExpansionService.js';

// Export diversity reranker (MMR)
export { applyMMR } from './DiversityReranker.js';

// Export shared rerank pipeline
export { DEFAULT_RELEVANCE, rerankPipeline } from './rerankPipeline.js';
export type {
  RerankableItem,
  RerankPipelineOptions,
  RerankPipelineResult,
} from './rerankPipeline.js';

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
