/**
 * DocumentSearchService Type Definitions
 *
 * Extends BaseSearchService types with document-specific functionality
 * including vector storage, retrieval, and specialized search options.
 */

import type {
    SearchFilters,
    SearchOptions,
    SearchParams,
    SearchResponse,
    RawChunk,
    ChunkData,
    TransformedChunk,
    EnhancedScore,
    HybridMetadata,
    HybridOptions,
    DocumentResult
} from '../../BaseSearchService/types.js';

// ============ Qdrant Filter Types ============

/**
 * Qdrant filter structure for vector search
 */
export interface QdrantFilter {
    must?: Array<{
        key: string;
        match?: {
            value?: string | number | boolean;
            any?: Array<string | number>;
        };
        range?: {
            gte?: number;
            lte?: number;
            gt?: number;
            lt?: number;
        };
    }>;
    should?: Array<{
        key: string;
        match?: {
            value?: string | number | boolean;
            any?: Array<string | number>;
        };
    }>;
    must_not?: Array<{
        key: string;
        match?: {
            value?: string | number | boolean;
            any?: Array<string | number>;
        };
    }>;
}

// ============ Document Search Parameters ============

/**
 * Extended search filters for document-specific queries
 */
export interface DocumentSearchFilters extends SearchFilters {
    /** Filter by specific document IDs */
    documentIds?: string[];
    /** Filter by source type (e.g., 'manual', 'wolke') */
    sourceType?: string;
    /** Filter by group ID */
    group_id?: string;
    /** Target collection for search (e.g., 'documents', 'grundsatz_documents') */
    searchCollection?: string;
    /** Filter by exact title match */
    titleFilter?: string;
    /** Additional Qdrant filters for custom queries */
    additionalFilter?: QdrantFilter;
}

/**
 * Extended search options for document operations
 */
export interface DocumentSearchOptions extends SearchOptions {
    /** Hybrid search configuration */
    hybridConfig?: HybridConfig;
    /** Recall limit for initial retrieval */
    recallLimit?: number;
    /** Minimum quality score threshold */
    qualityMin?: number;
    /** Search mode: vector, hybrid, text, or keyword (alias for text) */
    mode?: 'vector' | 'hybrid' | 'text' | 'keyword';
}

/**
 * Validated and normalized document search parameters
 */
export interface DocumentSearchParams {
    query: string;
    userId: string | null;
    filters: DocumentSearchFilters;
    options: DocumentSearchOptions & {
        limit: number;
        threshold: number;
        useCache: boolean;
    };
}

/**
 * Hybrid search configuration from vectorConfig
 */
export interface HybridConfig {
    minVectorOnlyThreshold?: number;
    minVectorWithTextThreshold?: number;
    minFinalScore?: number;
    minVectorOnlyFinalScore?: number;
    confidenceBoost?: number;
    confidencePenalty?: number;
    enableDynamicThresholds?: boolean;
    enableConfidenceWeighting?: boolean;
    enableQualityGate?: boolean;
}

// ============ Vector Storage Types ============

/**
 * Text chunk with metadata for vector embedding
 */
export interface ChunkWithMetadata {
    text: string;
    tokens?: number;
}

/**
 * Metadata attached to stored vectors
 */
export interface VectorMetadata {
    /** Source type identifier */
    sourceType?: string;
    /** Wolke share link identifier */
    wolkeShareLinkId?: string | null;
    /** Wolke file path */
    wolkeFilePath?: string | null;
    /** Document title */
    title?: string | null;
    /** Document filename */
    filename?: string | null;
    /** Additional custom payload fields */
    additionalPayload?: Record<string, unknown>;
}

/**
 * Result of vector storage operation
 */
export interface VectorStoreResult {
    success: boolean;
    vectorsStored: number;
    collectionName: string;
}

/**
 * Qdrant point structure for batch upsert
 */
export interface QdrantPoint {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
}

// ============ Search User Documents Types ============

/**
 * Options for searching user documents
 */
export interface SearchUserDocumentsOptions {
    /** Maximum number of results */
    limit?: number;
    /** Minimum similarity score threshold */
    scoreThreshold?: number;
    /** Filter by source type */
    sourceType?: string | null;
    /** Include full payload in results */
    includePayload?: boolean;
    /** Enable hybrid search mode */
    hybridMode?: boolean;
    /** Query text for hybrid mode */
    query?: string | null;
    /** Hybrid search options */
    hybridOptions?: HybridOptions;
}

/**
 * Result from user document search
 */
export interface UserDocumentSearchResult {
    success: boolean;
    results: Array<{
        id: string | number;
        score: number;
        payload?: Record<string, unknown>;
    }>;
    metadata?: {
        searchType: string;
        resultsCount: number;
        [key: string]: unknown;
    };
    query: {
        userId: string;
        limit: number;
        scoreThreshold: number;
        sourceType: string | null;
        hybridMode: boolean;
    };
}

// ============ Delete Operations Types ============

/**
 * Result of vector deletion operation
 */
export interface DeleteResult {
    success: boolean;
    documentId?: string;
    userId?: string;
}

// ============ Statistics Types ============

/**
 * User vector statistics
 */
export interface UserVectorStats {
    uniqueDocuments: number;
    totalVectors: number;
    manualVectors: number;
    wolkeVectors: number;
}

// ============ Document Text Retrieval Types ============

/**
 * Result of full text retrieval for a single document
 */
export interface DocumentFullTextResult {
    success: boolean;
    fullText: string;
    chunkCount: number;
    totalCharsReconstructed?: number;
    error?: string;
}

/**
 * Document data for bulk retrieval
 */
export interface BulkDocumentData {
    id: string;
    fullText: string;
    chunkCount: number;
    totalCharsReconstructed: number;
}

/**
 * Error information for bulk retrieval
 */
export interface BulkDocumentError {
    documentId: string;
    error: string;
}

/**
 * Result of bulk document text retrieval
 */
export interface BulkDocumentResult {
    documents: BulkDocumentData[];
    errors: BulkDocumentError[];
}

/**
 * Result of first chunk retrieval
 */
export interface FirstChunksResult {
    success: boolean;
    chunks: Record<string, string>;
    foundCount: number;
    error?: string;
}

// ============ Bundestag Search Types ============

/**
 * Options for Bundestag content search
 */
export interface BundestagSearchOptions {
    /** Filter by section */
    section?: string | null;
    /** Maximum number of results */
    limit?: number;
    /** Minimum similarity threshold */
    threshold?: number;
    /** Enable hybrid mode */
    hybridMode?: boolean;
}

/**
 * Chunk information in Bundestag result
 */
export interface BundestagChunk {
    text: string;
    chunk_index: number;
    score: number;
}

/**
 * Grouped Bundestag search result by URL
 */
export interface BundestagResultGroup {
    url: string;
    title: string;
    section: string;
    published_at: string;
    maxScore: number;
    chunks: BundestagChunk[];
}

/**
 * Result of Bundestag content search
 */
export interface BundestagSearchResult {
    success: boolean;
    results: BundestagResultGroup[];
    query?: string;
    searchType?: string;
    totalHits?: number;
    message?: string;
    error?: string;
}

// ============ Extended Chunk Types ============

/**
 * Extended raw chunk with quality and URL fields
 */
export interface DocumentRawChunk extends RawChunk {
    quality_score?: number | null;
    url?: string;
    searchMethod?: string;
    originalVectorScore?: number | null;
    originalTextScore?: number | null;
}

/**
 * Extended chunk data with quality information
 */
export interface DocumentChunkData extends ChunkData {
    quality_score?: number | null;
    url?: string;
}

/**
 * Extended transformed chunk with quality and URL
 */
export interface DocumentTransformedChunk extends TransformedChunk {
    quality_score?: number | null;
    content_type?: string | null;
    page_number?: number | null;
    url?: string;
}

// ============ Scoring Types ============

/**
 * Base score calculation result
 */
export interface BaseScore {
    finalScore: number;
    maxSimilarity: number;
    avgSimilarity: number;
    positionScore: number;
    diversityBonus: number;
}

/**
 * Enhanced score with quality information
 */
export interface DocumentEnhancedScore extends EnhancedScore {
    qualityAvg?: number;
}

// ============ Find Chunks Params ============

/**
 * Parameters for finding similar chunks
 */
export interface FindSimilarChunksParams {
    embedding: number[];
    userId: string | null;
    filters: DocumentSearchFilters;
    limit: number;
    threshold: number;
    query?: string;
    qualityMin?: number;
}

/**
 * Parameters for finding hybrid chunks
 */
export interface FindHybridChunksParams {
    embedding: number[];
    query: string;
    userId: string | null;
    filters: DocumentSearchFilters;
    limit: number;
    threshold: number;
    hybridOptions: HybridOptions;
}

// ============ Qdrant Payload Types ============

/**
 * Payload structure from Qdrant search results
 */
export interface QdrantResultPayload {
    user_id?: string;
    document_id?: string;
    url?: string;
    chunk_index?: number;
    chunk_text?: string;
    token_count?: number;
    quality_score?: number;
    content_type?: string;
    page_number?: number;
    created_at?: string;
    title?: string;
    filename?: string;
    source_type?: string;
    metadata?: {
        title?: string;
        filename?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

/**
 * Qdrant search result point
 * Compatible with VectorSearchResult from QdrantOperations
 */
export interface QdrantSearchResult {
    id: string | number;
    score: number;
    payload: QdrantResultPayload;
    vector?: number[] | null;
}

/**
 * Qdrant document for scroll operations
 * Compatible with ScrollPoint from QdrantOperations
 */
export interface QdrantDocument {
    id: string | number;
    payload: QdrantResultPayload;
    vector?: number[] | null;
}

// ============ Hybrid Search Result Types ============

/**
 * Hybrid search result with method tracking
 */
export interface HybridSearchResult {
    results: Array<QdrantSearchResult & {
        searchMethod?: string;
        originalVectorScore?: number | null;
        originalTextScore?: number | null;
    }>;
    metadata?: {
        hybridMethod?: string;
        [key: string]: unknown;
    };
}

// ============ Service State Types ============

/**
 * Internal service initialization state
 */
export interface ServiceState {
    initialized: boolean;
    qdrantAvailable: boolean;
}

// ============ Re-export commonly used BaseSearchService types ============

export type {
    SearchParams,
    SearchResponse,
    SearchFilters as BaseSearchFilters,
    SearchOptions as BaseSearchOptions,
    RawChunk,
    ChunkData,
    TransformedChunk,
    EnhancedScore,
    HybridMetadata,
    HybridOptions,
    DocumentResult
};
