/**
 * QdrantOperations Module Exports
 *
 * Re-exports all types, functions, and the main QdrantOperations class
 * for use by search services.
 */

// Main class
export { QdrantOperations, default } from './QdrantOperations.js';

// Types
export type {
  VectorSearchOptions,
  VectorSearchResult,
  HybridSearchOptions,
  HybridSearchResponse,
  HybridSearchResult,
  HybridSearchMetadata,
  TextSearchResult,
  ContextOptions,
  ChunkWithContext,
  BatchUpsertOptions,
  BatchUpsertResult,
  BatchDeleteResult,
  ScrollOptions,
  ScrollPoint,
  QdrantFilter,
  CollectionStats,
  HybridConfig,
  QualityConfig,
  RRFScoringItem,
  WeightedScoringItem,
  VariantSearchResult,
} from './types.js';

// Vector search functions
export { vectorSearch, searchWithQuality, searchWithIntent } from './vectorSearch.js';

// Hybrid search functions
export {
  hybridSearch,
  performTextSearch,
  calculateTextSearchScore,
  calculateDynamicThreshold,
  applyReciprocalRankFusion,
  applyWeightedCombination,
  applyQualityGate,
} from './hybridSearch.js';

// Context retrieval
export { getChunkWithContext } from './contextRetrieval.js';

// Batch operations
export {
  batchUpsert,
  batchDelete,
  scrollDocuments,
  healthCheck,
  getCollectionStats,
} from './batchOperations.js';

// Filter utilities
export {
  mergeFilters,
  isEmptyFilter,
  createMatchFilter,
  createRangeFilter,
  createAnyMatchFilter,
} from './filterUtils.js';
