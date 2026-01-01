/**
 * DocumentSearchService Module Exports
 *
 * Barrel export file for DocumentSearchService module.
 * Provides clean API surface for external consumers.
 */

// Main service class and factory
export { DocumentSearchService, getQdrantDocumentService } from './DocumentSearchService.js';

// Re-export all type definitions
export type {
    // Qdrant filter types
    QdrantFilter,

    // Document search parameters
    DocumentSearchFilters,
    DocumentSearchOptions,
    DocumentSearchParams,
    HybridConfig,

    // Vector storage types
    ChunkWithMetadata,
    VectorMetadata,
    VectorStoreResult,
    QdrantPoint,

    // Search user documents types
    SearchUserDocumentsOptions,
    UserDocumentSearchResult,

    // Delete operations types
    DeleteResult,

    // Statistics types
    UserVectorStats,

    // Document text retrieval types
    DocumentFullTextResult,
    BulkDocumentData,
    BulkDocumentError,
    BulkDocumentResult,
    FirstChunksResult,

    // Bundestag search types
    BundestagSearchOptions,
    BundestagChunk,
    BundestagResultGroup,
    BundestagSearchResult,

    // Extended chunk types
    DocumentRawChunk,
    DocumentChunkData,
    DocumentTransformedChunk,

    // Scoring types
    BaseScore,
    DocumentEnhancedScore,

    // Find chunks params
    FindSimilarChunksParams,
    FindHybridChunksParams,

    // Qdrant payload types
    QdrantResultPayload,
    QdrantSearchResult,
    QdrantDocument,

    // Hybrid search result types
    HybridSearchResult,

    // Service state types
    ServiceState,

    // Re-exported BaseSearchService types
    SearchParams,
    SearchResponse,
    ChunkData,
    TransformedChunk,
    EnhancedScore,
    HybridMetadata,
    HybridOptions,
    DocumentResult
} from './types.js';

// Export operation modules (if needed externally)
export * as vectorOperations from './vectorOperations.js';
export * as documentRetrieval from './documentRetrieval.js';
export * as searchOperations from './searchOperations.js';
export * as scoring from './scoring.js';

// Default export
export { DocumentSearchService as default } from './DocumentSearchService.js';
