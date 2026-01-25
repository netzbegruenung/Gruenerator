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
