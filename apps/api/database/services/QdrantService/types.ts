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
  host?: string | undefined;
  /** Qdrant server port */
  port?: number | undefined;
  /** Full URL to Qdrant server (alternative to host/port) */
  url?: string | undefined;
  /** API key for authentication */
  apiKey?: string | undefined;
  /** Whether to use HTTPS */
  https?: boolean | undefined;
  /** Request timeout in milliseconds */
  timeout?: number | undefined;
  /** Basic auth username */
  basicAuthUsername?: string | undefined;
  /** Basic auth password */
  basicAuthPassword?: string | undefined;
  /** URL path prefix (e.g., '/qdrant/') */
  prefix?: string | undefined;
  /** Skip compatibility check for faster startup */
  checkCompatibility?: boolean | undefined;
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
  notebook_public_access: string;
  oparl_papers: string;
  kommunalwiki_documents: string;
  bundestag_content: string;
  gruene_de_documents: string;
  gruene_at_documents: string;
  landesverbaende_documents: string;
  abgeordnetenwatch_documents: string;
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
  userId?: string | null | undefined;
  /** Document IDs to filter results */
  documentIds?: string[] | null | undefined;
  /** Maximum number of results to return */
  limit?: number | undefined;
  /** Minimum similarity score threshold */
  threshold?: number | undefined;
  /** Target collection for the search */
  collection?: string | undefined;
  /** Whether to include payload in results */
  withPayload?: boolean | undefined;
  /** Whether to include vectors in results */
  withVector?: boolean | undefined;
  /** HNSW ef parameter for search quality */
  ef?: number | null | undefined;
}

/**
 * Options for hybrid search combining vector and text search
 */
export interface HybridSearchOptions extends SearchOptions {
  /** Weight for vector search component (0-1) */
  vectorWeight?: number | undefined;
  /** Weight for text search component (0-1) */
  textWeight?: number | undefined;
  /** Whether to use Reciprocal Rank Fusion */
  useRRF?: boolean | undefined;
  /** RRF constant k */
  rrfK?: number | undefined;
  /** Recall limit for initial retrieval */
  recallLimit?: number | undefined;
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
  user_id?: string | null | undefined;
  /** Optional title */
  title?: string | null | undefined;
  /** Optional filename */
  filename?: string | null | undefined;
  /** Source URL for web content */
  url?: string | null | undefined;
  /** Section/category for web content */
  section?: string | null | undefined;
  /** Publication date for web content */
  published_at?: string | null | undefined;
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
  originalVectorScore?: number | null | undefined;
  /** Original text search score */
  originalTextScore?: number | null | undefined;
  /** Confidence level for this result */
  confidence?: number | undefined;
  /** Raw RRF score before normalization */
  rawRRFScore?: number | undefined;
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
  text?: string | undefined;
  chunk_text?: string | undefined;
  /** Embedding vector */
  embedding: number[];
  /** Token count */
  token_count?: number | undefined;
  tokens?: number | undefined;
  /** Chunk index within document */
  chunk_index?: number | undefined;
  /** Optional title */
  title?: string | undefined;
  /** Optional filename */
  filename?: string | undefined;
  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
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
  categories?: string[] | undefined;
  /** Tags for the content */
  tags?: string[] | undefined;
  /** Short description */
  description?: string | undefined;
  /** Additional content data */
  content_data?: Record<string, unknown> | undefined;
  /** Extra metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Creation timestamp */
  created_at?: string | undefined;
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
  description?: string | undefined;
  /** Additional content data */
  content_data?: Record<string, unknown> | undefined;
  /** Metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Creation timestamp */
  created_at?: string | undefined;
  /** Similarity score (duplicate for compatibility) */
  similarity_score?: number | undefined;
}

/**
 * Options for content example search
 */
export interface ContentExampleSearchOptions {
  /** Maximum results to return */
  limit?: number | undefined;
  /** Minimum similarity threshold */
  threshold?: number | undefined;
  /** Filter by content type */
  contentType?: string | undefined;
  /** Filter by categories */
  categories?: string[] | undefined;
  /** Filter by tags */
  tags?: string[] | undefined;
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
  country?: 'DE' | 'AT' | undefined;
  /** Source account name/handle */
  source_account?: string | undefined;
  /** Engagement metrics */
  engagement?: Record<string, number> | undefined;
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
  country?: string | null | undefined;
  /** Source account */
  source_account?: string | null | undefined;
  /** Creation timestamp */
  created_at?: string | undefined;
  /** Debug payload (development only) */
  _debug_payload?: Record<string, unknown> | undefined;
}

/**
 * Options for social media search
 */
export interface SocialMediaSearchOptions {
  /** Maximum results to return */
  limit?: number | undefined;
  /** Minimum similarity threshold */
  threshold?: number | undefined;
  /** Filter by platform */
  platform?: 'facebook' | 'instagram' | undefined;
  /** Filter by country */
  country?: 'DE' | 'AT' | undefined;
  /**
   * Filter by Landesverband short code(s). Scalar 'BE' for a single LV,
   * array ['BE', 'BE-F'] for LVs that publish under multiple codes
   * (Landesverband + Fraktion). Records without a `landesverband` payload
   * (federal accounts) are filtered out when this option is set.
   */
  landesverband?: string | readonly string[] | undefined;
  /**
   * Override the target Qdrant collection. Defaults to `social_media_examples`.
   * Set by per-person tweet-style agents (e.g. Ricarda Lang → `ricarda_lang_tweets`)
   * to search a curated personal corpus instead of the shared green-social pool.
   * The override collection must share the social_media_examples payload shape
   * (written via `indexSocialMediaExample`).
   */
  collection?: string | undefined;
}

// =============================================================================
// Qdrant Point Types
// =============================================================================

/**
 * Base payload structure for Qdrant points
 */
export interface BasePointPayload {
  /** Document or source identifier */
  document_id?: string | undefined;
  source_url?: string | undefined;
  example_id?: string | undefined;
  /** Chunk information */
  chunk_index?: number | undefined;
  chunk_text?: string | undefined;
  token_count?: number | undefined;
  /** User ownership */
  user_id?: string | null | undefined;
  /** Timestamps */
  created_at?: string | undefined;
  indexed_at?: string | undefined;
  /** Content metadata */
  title?: string | null | undefined;
  filename?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
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
  content_type?: string | undefined;
  page_number?: number | undefined;
}

/**
 * Website content payload (bundestag, gruene.de, gruene.at)
 */
export interface WebsiteContentPayload extends BasePointPayload {
  source_url: string;
  primary_category?: string | null | undefined;
  published_at?: string | null | undefined;
  content_hash?: string | null | undefined;
  country: 'DE' | 'AT';
}

/**
 * Content example payload
 */
export interface ContentExamplePayload extends BasePointPayload {
  example_id: string;
  type: string;
  content: string;
  categories?: string[] | undefined;
  tags?: string[] | undefined;
  description?: string | undefined;
  content_data?: Record<string, unknown> | undefined;
}

/**
 * Social media example payload
 */
export interface SocialMediaPayload extends BasePointPayload {
  example_id: string;
  platform: 'facebook' | 'instagram';
  content: string;
  country?: 'DE' | 'AT' | undefined;
  source_account?: string | undefined;
  engagement?: Record<string, number> | undefined;
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
    vector?: number[] | null | undefined;
  }>;
  /** Offset for next page */
  next_page_offset?: string | number | null | undefined;
}

/**
 * Options for scroll operations
 */
export interface ScrollOptions {
  /** Maximum points to return */
  limit?: number | undefined;
  /** Include payload */
  withPayload?: boolean | string[] | undefined;
  /** Include vectors */
  withVector?: boolean | undefined;
  /** Pagination offset */
  offset?: string | number | null | undefined;
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
  wait?: boolean | undefined;
  /** Maximum retry attempts */
  maxRetries?: number | undefined;
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
  vectors_count?: number | undefined;
  /** Number of indexed vectors */
  indexed_vectors_count?: number | undefined;
  /** Total number of points */
  points_count?: number | undefined;
  /** Number of segments */
  segments_count?: number | undefined;
  /** Collection status */
  status?: string | undefined;
  /** Optimizer status */
  optimizer_status?: string | undefined;
  /** Error message if retrieval failed */
  error?: string | undefined;
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
    value?: string | number | boolean | undefined;
    /** Match any of these values */
    any?: (string | number)[];
    /** Text search match */
    text?: string | undefined;
  };
  /** Range condition */
  range?: {
    /** Greater than */
    gt?: number | string | undefined;
    /** Greater than or equal */
    gte?: number | string | undefined;
    /** Less than */
    lt?: number | string | undefined;
    /** Less than or equal */
    lte?: number | string | undefined;
  };
}

/**
 * Qdrant filter object
 */
export interface QdrantFilter {
  /** All conditions must match */
  must?: FilterCondition[] | undefined;
  /** None of these conditions should match */
  must_not?: FilterCondition[] | undefined;
  /** At least one condition should match */
  should?: FilterCondition[] | undefined;
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
  content_hash?: string | null | undefined;
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
  filter?: QdrantFilter | undefined;
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
  vectorSize?: number | undefined;

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
