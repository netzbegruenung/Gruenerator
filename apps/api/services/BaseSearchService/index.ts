/**
 * BaseSearchService - Backward compatible exports
 *
 * All existing imports will continue to work:
 * - import { BaseSearchService } from '../services/BaseSearchService.js'
 * - import { SearchError } from '../services/BaseSearchService.js'
 */

// Main class and error
export { BaseSearchService, SearchError } from './BaseSearchService.js';

// Default export for compatibility
export { BaseSearchService as default } from './BaseSearchService.js';

// Type exports
export type {
  SearchParams,
  ValidatedSearchParams,
  SearchFilters,
  SearchOptions,
  SearchResponse,
  RawChunk,
  ChunkData,
  TransformedChunk,
  DocumentData,
  DocumentResult,
  TopChunk,
  HybridMetadata,
  EnhancedScore,
  SimilarChunkParams,
  HybridChunkParams,
  HybridOptions,
  RPCParams,
  Cache,
  CacheStats,
  ErrorHandler,
  ErrorHandlerOptions,
  BaseSearchServiceOptions,
  MMROptions,
  ScoringConfig
} from './types.js';

// Text utilities for subclasses that need them
export {
  looksLikeTOC,
  escapeRegExp,
  highlightTerm,
  trimToSentenceBoundary,
  needsLeadingEllipsis,
  needsTrailingEllipsis,
  extractMatchedExcerpt,
  extractSimpleExcerpt
} from './textUtils.js';

// Scoring utilities for subclasses
export {
  calculateEnhancedDocumentScore,
  calculateHybridDocumentScore,
  calculateDynamicThreshold,
  calculateStaticDocumentScore,
  calculateStaticThreshold,
  applyMMRSelection
} from './scoring.js';

// KeywordExtractor exports
export { KeywordExtractor, keywordExtractor } from './KeywordExtractor.js';
export type {
  SearchPatternResult,
  KeywordExtractionResult,
  WeightedKeyword,
  KeywordExtractionOptions,
  Language,
  KeywordExtractorStats
} from './keyword-extractor-types.js';
