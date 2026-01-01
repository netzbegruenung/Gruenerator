/**
 * QdrantService Module Exports
 *
 * Re-exports all types, functions, and the main QdrantService class
 * for backward compatibility with existing imports.
 */

// Main service class and singleton
export { QdrantService, getQdrantInstance, default } from './QdrantService.js';

// Types
export type {
  CollectionNames,
  CollectionKey,
  CollectionStats,
  QdrantConfig,
  SearchOptions,
  SearchResult,
  IndexResult,
  ContentExampleMetadata,
  SocialMediaMetadata,
  PointPayload,
  ScrollResult,
  QdrantFilter,
  FilterCondition,
  ChunkData
} from './types.js';

// Connection utilities
export {
  createQdrantClient,
  testConnection,
  testConnectionWithRetry,
  checkConnectionHealth
} from './connection.js';

// Collection management
export {
  createCollections,
  createTextSearchIndexes,
  getCollectionStats,
  getAllStats,
  createSnapshot,
  type CollectionSchema,
  type CollectionConfig,
  type IndexDefinition,
  type IndexSchema,
  type SnapshotResult
} from './collections.js';

// Indexing functions
export {
  indexDocumentChunks,
  indexGrundsatzChunks,
  indexBundestagContent,
  indexGrueneDeContent,
  indexGrueneAtContent,
  indexContentExample,
  indexSocialMediaExample,
  type DocumentChunk,
  type GrundsatzChunk,
  type WebContentChunk,
  type WebContentMetadata
} from './indexing.js';

// Search functions
export {
  searchDocuments,
  searchGrundsatzDocuments,
  searchBundestagDocuments,
  searchGrueneDeDocuments,
  searchGrueneAtDocuments,
  searchContentExamples,
  searchSocialMediaExamples,
  buildContentExampleFilter,
  buildSocialMediaFilter,
  extractMultiFieldContent
} from './search.js';

// Deletion functions
export {
  deleteDocument,
  deleteUserVectors,
  deleteBundestagContentByUrl,
  deleteGrueneDeContentByUrl,
  deleteGrueneAtContentByUrl,
  deleteContentExample
} from './deletion.js';

// Faceted search utilities
export {
  getUniqueFieldValues,
  getFieldValueCounts,
  getDateRange,
  getAllUrls,
  deleteByUrl,
  type FieldValueCount,
  type DateRange
} from './facets.js';

// Random sampling
export {
  calculateRandomOffset,
  shuffleAndLimit,
  getRandomContentExamples,
  getRandomSocialMediaExamples
} from './random.js';

// Operations (high-level search algorithms)
export { QdrantOperations } from './operations/index.js';

// Utility functions
export {
  stringToNumericId,
  chunkToNumericId
} from './utils.js';
