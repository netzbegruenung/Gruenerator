/**
 * TypeScript interfaces for QdrantService
 * Provides type definitions for Qdrant vector database operations
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Qdrant client configuration options
 */
export interface QdrantConfig {
    /** Qdrant server host */
    host?: string;
    /** Qdrant server port */
    port?: number;
    /** Full URL to Qdrant server (alternative to host/port) */
    url?: string;
    /** API key for authentication */
    apiKey?: string;
    /** Whether to use HTTPS */
    https?: boolean;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Basic auth username */
    basicAuthUsername?: string;
    /** Basic auth password */
    basicAuthPassword?: string;
    /** URL path prefix (e.g., '/qdrant/') */
    prefix?: string;
    /** Skip compatibility check for faster startup */
    checkCompatibility?: boolean;
}

/**
 * All available collection names in the Qdrant service
 */
export interface CollectionNames {
    documents: string;
    grundsatz_documents: string;
    oesterreich_gruene_documents: string;
    user_knowledge: string;
    content_examples: string;
    social_media_examples: string;
    user_texts: string;
    notebook_collections: string;
    notebook_collection_documents: string;
    notebook_usage_logs: string;
    notebook_public_access: string;
    oparl_papers: string;
    kommunalwiki_documents: string;
    bundestag_content: string;
    gruene_de_documents: string;
    gruene_at_documents: string;
}

/**
 * Valid collection name keys
 */
export type CollectionKey = keyof CollectionNames;

// =============================================================================
// Search Types
// =============================================================================

/**
 * Options for vector search operations
 */
export interface SearchOptions {
    /** User ID for filtering results */
    userId?: string | null;
    /** Document IDs to filter results */
    documentIds?: string[] | null;
    /** Maximum number of results to return */
    limit?: number;
    /** Minimum similarity score threshold */
    threshold?: number;
    /** Target collection for the search */
    collection?: string;
    /** Whether to include payload in results */
    withPayload?: boolean;
    /** Whether to include vectors in results */
    withVector?: boolean;
    /** HNSW ef parameter for search quality */
    ef?: number | null;
}

/**
 * Options for hybrid search combining vector and text search
 */
export interface HybridSearchOptions extends SearchOptions {
    /** Weight for vector search component (0-1) */
    vectorWeight?: number;
    /** Weight for text search component (0-1) */
    textWeight?: number;
    /** Whether to use Reciprocal Rank Fusion */
    useRRF?: boolean;
    /** RRF constant k */
    rrfK?: number;
    /** Recall limit for initial retrieval */
    recallLimit?: number;
}

/**
 * Individual search result from Qdrant
 */
export interface SearchResult {
    /** Point ID in Qdrant */
    id: string | number;
    /** Similarity score */
    score: number;
    /** Document ID this chunk belongs to */
    document_id: string;
    /** Text content of the chunk */
    chunk_text: string;
    /** Index of the chunk within the document */
    chunk_index: number;
    /** Additional metadata */
    metadata: Record<string, unknown>;
    /** User ID who owns this document */
    user_id?: string | null;
    /** Optional title */
    title?: string | null;
    /** Optional filename */
    filename?: string | null;
    /** Source URL for web content */
    url?: string | null;
    /** Section/category for web content */
    section?: string | null;
    /** Publication date for web content */
    published_at?: string | null;
}

/**
 * Response from search operations
 */
export interface SearchResponse {
    /** Whether the search was successful */
    success: boolean;
    /** Array of search results */
    results: SearchResult[];
    /** Total number of results */
    total: number;
}

/**
 * Hybrid search result with additional metadata
 */
export interface HybridSearchResult extends SearchResult {
    /** Method used to find this result */
    searchMethod: 'vector' | 'text' | 'hybrid';
    /** Original vector search score */
    originalVectorScore?: number | null;
    /** Original text search score */
    originalTextScore?: number | null;
    /** Confidence level for this result */
    confidence?: number;
    /** Raw RRF score before normalization */
    rawRRFScore?: number;
}

/**
 * Metadata for hybrid search response
 */
export interface HybridSearchMetadata {
    /** Number of vector search results */
    vectorResults: number;
    /** Number of text search results */
    textResults: number;
    /** Fusion method used */
    fusionMethod: 'RRF' | 'weighted';
    /** Applied vector weight */
    vectorWeight: number;
    /** Applied text weight */
    textWeight: number;
    /** Dynamic threshold used */
    dynamicThreshold: number;
    /** Whether quality filtering was applied */
    qualityFiltered: boolean;
    /** Whether auto-switched from RRF */
    autoSwitchedFromRRF: boolean;
    /** Whether real text matches were found */
    hasRealTextMatches: boolean;
    /** Types of text matches found */
    textMatchTypes: string[];
}

/**
 * Response from hybrid search operations
 */
export interface HybridSearchResponse {
    /** Whether the search was successful */
    success: boolean;
    /** Array of hybrid search results */
    results: HybridSearchResult[];
    /** Search metadata */
    metadata: HybridSearchMetadata;
}

// =============================================================================
// Indexing Types
// =============================================================================

/**
 * Result from indexing operations
 */
export interface IndexResult {
    /** Whether indexing was successful */
    success: boolean;
    /** Number of chunks indexed */
    chunks: number;
}

/**
 * Chunk data for indexing
 */
export interface ChunkData {
    /** Chunk text content */
    text?: string;
    chunk_text?: string;
    /** Embedding vector */
    embedding: number[];
    /** Token count */
    token_count?: number;
    tokens?: number;
    /** Chunk index within document */
    chunk_index?: number;
    /** Optional title */
    title?: string;
    /** Optional filename */
    filename?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

// =============================================================================
// Content Example Types
// =============================================================================

/**
 * Metadata for content examples (press releases, blog posts, etc.)
 */
export interface ContentExampleMetadata {
    /** Type of content (e.g., 'press_release', 'blog_post') */
    type: string;
    /** Title of the content */
    title: string;
    /** Full content text */
    content: string;
    /** Categories this content belongs to */
    categories?: string[];
    /** Tags for the content */
    tags?: string[];
    /** Short description */
    description?: string;
    /** Additional content data */
    content_data?: Record<string, unknown>;
    /** Extra metadata */
    metadata?: Record<string, unknown>;
    /** Creation timestamp */
    created_at?: string;
}

/**
 * Search result for content examples
 */
export interface ContentExampleResult {
    /** Example ID */
    id: string;
    /** Similarity score */
    score: number;
    /** Title */
    title: string;
    /** Content */
    content: string;
    /** Content type */
    type: string;
    /** Categories */
    categories: string[];
    /** Tags */
    tags: string[];
    /** Description */
    description?: string;
    /** Additional content data */
    content_data?: Record<string, unknown>;
    /** Metadata */
    metadata?: Record<string, unknown>;
    /** Creation timestamp */
    created_at?: string;
    /** Similarity score (duplicate for compatibility) */
    similarity_score?: number;
}

/**
 * Options for content example search
 */
export interface ContentExampleSearchOptions {
    /** Maximum results to return */
    limit?: number;
    /** Minimum similarity threshold */
    threshold?: number;
    /** Filter by content type */
    contentType?: string;
    /** Filter by categories */
    categories?: string[];
    /** Filter by tags */
    tags?: string[];
}

// =============================================================================
// Social Media Types
// =============================================================================

/**
 * Metadata for social media examples (Facebook, Instagram posts)
 */
export interface SocialMediaMetadata {
    /** Platform: 'facebook' or 'instagram' */
    platform: 'facebook' | 'instagram';
    /** Country code: 'DE' or 'AT' */
    country?: 'DE' | 'AT';
    /** Source account name/handle */
    source_account?: string;
    /** Engagement metrics */
    engagement?: Record<string, number>;
}

/**
 * Search result for social media examples
 */
export interface SocialMediaResult {
    /** Example ID */
    id: string | number;
    /** Similarity score */
    score: number;
    /** Post content/caption */
    content: string;
    /** Platform */
    platform: string;
    /** Country */
    country?: string | null;
    /** Source account */
    source_account?: string | null;
    /** Creation timestamp */
    created_at?: string;
    /** Debug payload (development only) */
    _debug_payload?: Record<string, unknown>;
}

/**
 * Options for social media search
 */
export interface SocialMediaSearchOptions {
    /** Maximum results to return */
    limit?: number;
    /** Minimum similarity threshold */
    threshold?: number;
    /** Filter by platform */
    platform?: 'facebook' | 'instagram';
    /** Filter by country */
    country?: 'DE' | 'AT';
}

// =============================================================================
// Qdrant Point Types
// =============================================================================

/**
 * Base payload structure for Qdrant points
 */
export interface BasePointPayload {
    /** Document or source identifier */
    document_id?: string;
    source_url?: string;
    example_id?: string;
    /** Chunk information */
    chunk_index?: number;
    chunk_text?: string;
    token_count?: number;
    /** User ownership */
    user_id?: string | null;
    /** Timestamps */
    created_at?: string;
    indexed_at?: string;
    /** Content metadata */
    title?: string | null;
    filename?: string | null;
    metadata?: Record<string, unknown>;
}

/**
 * Document chunk payload
 */
export interface DocumentPointPayload extends BasePointPayload {
    document_id: string;
    chunk_index: number;
    chunk_text: string;
    user_id: string | null;
}

/**
 * Grundsatz document payload
 */
export interface GrundsatzPointPayload extends BasePointPayload {
    document_id: string;
    document_type: 'grundsatz';
    content_type?: string;
    page_number?: number;
}

/**
 * Website content payload (bundestag, gruene.de, gruene.at)
 */
export interface WebsiteContentPayload extends BasePointPayload {
    source_url: string;
    primary_category?: string | null;
    published_at?: string | null;
    content_hash?: string | null;
    country: 'DE' | 'AT';
}

/**
 * Content example payload
 */
export interface ContentExamplePayload extends BasePointPayload {
    example_id: string;
    type: string;
    content: string;
    categories?: string[];
    tags?: string[];
    description?: string;
    content_data?: Record<string, unknown>;
}

/**
 * Social media example payload
 */
export interface SocialMediaPayload extends BasePointPayload {
    example_id: string;
    platform: 'facebook' | 'instagram';
    content: string;
    country?: 'DE' | 'AT';
    source_account?: string;
    engagement?: Record<string, number>;
}

/**
 * Union type for all point payloads
 */
export type PointPayload =
    | DocumentPointPayload
    | GrundsatzPointPayload
    | WebsiteContentPayload
    | ContentExamplePayload
    | SocialMediaPayload
    | BasePointPayload;

/**
 * Qdrant point structure
 */
export interface QdrantPoint {
    /** Point ID (numeric for Qdrant) */
    id: number;
    /** Embedding vector */
    vector: number[];
    /** Point payload */
    payload: PointPayload;
}

// =============================================================================
// Scroll and Batch Types
// =============================================================================

/**
 * Result from scroll operations
 */
export interface ScrollResult {
    /** Retrieved points */
    points: Array<{
        id: string | number;
        payload: Record<string, unknown>;
        vector?: number[] | null;
    }>;
    /** Offset for next page */
    next_page_offset?: string | number | null;
}

/**
 * Options for scroll operations
 */
export interface ScrollOptions {
    /** Maximum points to return */
    limit?: number;
    /** Include payload */
    withPayload?: boolean | string[];
    /** Include vectors */
    withVector?: boolean;
    /** Pagination offset */
    offset?: string | number | null;
}

/**
 * Result from batch upsert operations
 */
export interface BatchUpsertResult {
    /** Whether upsert was successful */
    success: boolean;
    /** Number of points upserted */
    pointsUpserted: number;
    /** Target collection */
    collection: string;
}

/**
 * Options for batch upsert operations
 */
export interface BatchUpsertOptions {
    /** Wait for upsert to complete */
    wait?: boolean;
    /** Maximum retry attempts */
    maxRetries?: number;
}

/**
 * Result from batch delete operations
 */
export interface BatchDeleteResult {
    /** Whether delete was successful */
    success: boolean;
    /** Target collection */
    collection: string;
}

// =============================================================================
// Collection Statistics Types
// =============================================================================

/**
 * Statistics for a Qdrant collection
 */
export interface CollectionStats {
    /** Collection name */
    name: string;
    /** Total number of vectors */
    vectors_count?: number;
    /** Number of indexed vectors */
    indexed_vectors_count?: number;
    /** Total number of points */
    points_count?: number;
    /** Number of segments */
    segments_count?: number;
    /** Collection status */
    status?: string;
    /** Optimizer status */
    optimizer_status?: string;
    /** Error message if retrieval failed */
    error?: string;
}

/**
 * Statistics for all collections
 */
export type AllCollectionStats = Record<CollectionKey, CollectionStats>;

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Qdrant filter condition
 */
export interface FilterCondition {
    /** Field key to filter on */
    key: string;
    /** Match condition */
    match?: {
        /** Exact value match */
        value?: string | number | boolean;
        /** Match any of these values */
        any?: (string | number)[];
        /** Text search match */
        text?: string;
    };
    /** Range condition */
    range?: {
        /** Greater than */
        gt?: number | string;
        /** Greater than or equal */
        gte?: number | string;
        /** Less than */
        lt?: number | string;
        /** Less than or equal */
        lte?: number | string;
    };
}

/**
 * Qdrant filter object
 */
export interface QdrantFilter {
    /** All conditions must match */
    must?: FilterCondition[];
    /** None of these conditions should match */
    must_not?: FilterCondition[];
    /** At least one condition should match */
    should?: FilterCondition[];
}

// =============================================================================
// URL Tracking Types
// =============================================================================

/**
 * URL tracking info for deduplication
 */
export interface UrlTrackingInfo {
    /** Source URL */
    source_url: string;
    /** Content hash for change detection */
    content_hash?: string | null;
}

// =============================================================================
// Field Value Types
// =============================================================================

/**
 * Field value with count for faceted search
 */
export interface FieldValueCount {
    /** Field value */
    value: string;
    /** Number of documents with this value */
    count: number;
}

/**
 * Date range for a field
 */
export interface DateRange {
    /** Minimum date value */
    min: string | null;
    /** Maximum date value */
    max: string | null;
}

// =============================================================================
// Quality and Intent Types
// =============================================================================

/**
 * Query intent information for intent-aware search
 */
export interface QueryIntent {
    /** Intent type */
    type: string;
    /** Detected language */
    language: string;
    /** Generated filter based on intent */
    filter?: QdrantFilter;
}

/**
 * Chunk with context for contextual retrieval
 */
export interface ChunkWithContext {
    /** The center/target chunk */
    center: {
        id: string | number;
        payload: Record<string, unknown>;
    } | null;
    /** Surrounding context chunks */
    context: Array<{
        id: string | number;
        payload: Record<string, unknown>;
    }>;
}

// =============================================================================
// Service Types
// =============================================================================

/**
 * Qdrant service instance interface
 */
export interface IQdrantService {
    /** Qdrant client instance */
    client: unknown;
    /** Connection status */
    isConnected: boolean;
    /** Collection name mappings */
    collections: CollectionNames;
    /** Vector dimensions */
    vectorSize?: number;

    // Core methods
    init(): Promise<void>;
    isAvailable(): Promise<boolean>;
    ensureConnected(): Promise<void>;

    // Document operations
    indexDocumentChunks(
        documentId: string,
        chunks: ChunkData[],
        userId?: string | null,
        collectionName?: string | null
    ): Promise<IndexResult>;
    searchDocuments(queryVector: number[], options?: SearchOptions): Promise<SearchResponse>;
    deleteDocument(documentId: string, collection?: string): Promise<{ success: boolean }>;

    // Statistics
    getCollectionStats(collection?: string): Promise<CollectionStats>;
    getAllStats(): Promise<AllCollectionStats>;
}

/**
 * Qdrant operations interface for reusable operations
 */
export interface IQdrantOperations {
    /** Qdrant client instance */
    client: unknown;

    // Search methods
    vectorSearch(
        collection: string,
        queryVector: number[],
        filter?: QdrantFilter,
        options?: SearchOptions
    ): Promise<SearchResult[]>;

    hybridSearch(
        collection: string,
        queryVector: number[],
        query: string,
        filter?: QdrantFilter,
        options?: HybridSearchOptions
    ): Promise<HybridSearchResponse>;

    searchWithQuality(
        collection: string,
        queryVector: number[],
        filter?: QdrantFilter,
        options?: SearchOptions
    ): Promise<SearchResult[]>;

    searchWithIntent(
        collection: string,
        queryVector: number[],
        intent: QueryIntent,
        baseFilter?: QdrantFilter,
        options?: SearchOptions
    ): Promise<SearchResult[]>;

    // Context retrieval
    getChunkWithContext(
        collection: string,
        pointOrId: string | number | Record<string, unknown>,
        options?: { window?: number }
    ): Promise<ChunkWithContext>;

    // Batch operations
    batchUpsert(
        collection: string,
        points: QdrantPoint[],
        options?: BatchUpsertOptions
    ): Promise<BatchUpsertResult>;

    batchDelete(collection: string, filter: QdrantFilter): Promise<BatchDeleteResult>;

    scrollDocuments(
        collection: string,
        filter?: QdrantFilter,
        options?: ScrollOptions
    ): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>>;

    // Utilities
    mergeFilters(a?: QdrantFilter, b?: QdrantFilter): QdrantFilter;
    healthCheck(): Promise<boolean>;
    getCollectionStats(collection: string): Promise<CollectionStats>;
}
