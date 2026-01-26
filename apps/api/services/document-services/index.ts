/**
 * Document Services Module Exports
 *
 * Barrel export file for all document-related services.
 * Provides unified API surface for external consumers.
 */

// DocumentSearchService - Vector and hybrid search
export { DocumentSearchService, getQdrantDocumentService } from './DocumentSearchService/index.js';

// DocumentContentService - Content operations
export {
  DocumentContentService,
  getDocumentContentService,
} from './DocumentContentService/index.js';

// DocumentProcessingService - Processing and extraction
export {
  DocumentProcessingService,
  getDocumentProcessingService,
} from './DocumentProcessingService/index.js';

// PostgresDocumentService - Database operations
export {
  PostgresDocumentService,
  getPostgresDocumentService,
} from './PostgresDocumentService/index.js';

// DocumentQnAService - Question-answering capabilities
export { DocumentQnAService } from './DocumentQnAService/index.js';

// TextChunker - Text segmentation utilities
export {
  smartChunkDocument,
  smartChunkDocumentAsync,
  hierarchicalChunkDocument,
  estimateTokens,
  LangChainChunker,
  langChainChunker,
} from './TextChunker/index.js';

// Re-export types from all submodules
// Note: Using explicit exports to avoid naming conflicts between modules

// DocumentSearchService types
export type {
  DocumentSearchOptions,
  DocumentSearchParams,
  HybridSearchResult,
  VectorStoreResult,
  DeleteResult as SearchDeleteResult, // Renamed to avoid conflict with PostgresDocumentService
  ChunkWithMetadata,
  VectorMetadata,
} from './DocumentSearchService/types.js';

// DocumentContentService types
export type * from './DocumentContentService/types.js';

// DocumentProcessingService types (ChunkingOptions defined here - primary source)
export type {
  ChunkingOptions,
  ProcessingResult,
  ChunkAndEmbedResult,
} from './DocumentProcessingService/types.js';

// PostgresDocumentService types
export type {
  DocumentRecord,
  DocumentMetadata,
  DocumentUpdateData,
  UserTextDocument,
  DocumentStats,
  BulkDeleteResult,
  DeleteResult as PostgresDeleteResult, // Renamed to avoid conflict with DocumentSearchService
} from './PostgresDocumentService/types.js';

// DocumentQnAService types
export type * from './DocumentQnAService/types.js';

// TextChunker types (ChunkingOptions also defined here but we use ProcessingService's version)
export type {
  Chunk,
  ChunkMetadata,
  ChunkingOptions as TextChunkerChunkingOptions, // Renamed to avoid conflict
} from './TextChunker/types.js';
