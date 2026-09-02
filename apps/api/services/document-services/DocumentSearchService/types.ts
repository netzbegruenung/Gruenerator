/**
 * DocumentSearchService Type Definitions
 *
 * Extends BaseSearchService types with document-specific functionality
 * including vector storage, retrieval, and specialized search options.
 */

import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';
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
  DocumentResult,
} from '../../BaseSearchService/types.js';
import type { ChunkMetadata } from '../TextChunker/types.js';

// ============ Qdrant Filter Types ============

export type { QdrantFilter };

// ============ Document Search Parameters ============

/**
 * Extended search filters for document-specific queries
 */
export interface DocumentSearchFilters extends SearchFilters {
  /** Filter by specific document IDs */
  documentIds?: string[] | undefined;
  /** Filter by source type (e.g., 'manual', 'wolke') */
  sourceType?: string | undefined;
  /** Filter by group ID */
  group_id?: string | undefined;
  /** Target collection for search (e.g., 'documents', 'grundsatz_documents') */
  searchCollection?: string | undefined;
  /** Filter by exact title match */
  titleFilter?: string | undefined;
  /** Additional Qdrant filters for custom queries */
  additionalFilter?: QdrantFilter | undefined;
}

/**
 * Extended search options for document operations
 */
export interface DocumentSearchOptions extends SearchOptions {
  /** Hybrid search configuration */
  hybridConfig?: HybridConfig | undefined;
  /** Recall limit for initial retrieval */
  recallLimit?: number | undefined;
  /** Minimum quality score threshold */
  qualityMin?: number | undefined;
  /** Search mode: vector, hybrid, text, or keyword (alias for text) */
  mode?: 'vector' | 'hybrid' | 'text' | 'keyword' | undefined;
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
  minVectorOnlyThreshold?: number | undefined;
  minVectorWithTextThreshold?: number | undefined;
  minFinalScore?: number | undefined;
  minVectorOnlyFinalScore?: number | undefined;
  confidenceBoost?: number | undefined;
  confidencePenalty?: number | undefined;
  enableDynamicThresholds?: boolean | undefined;
  enableConfidenceWeighting?: boolean | undefined;
  enableQualityGate?: boolean | undefined;
}

// ============ Vector Storage Types ============

/**
 * Text chunk with metadata for vector embedding
 */
export interface ChunkWithMetadata {
  text: string;
  tokens?: number | undefined;
  metadata?: ChunkMetadata | undefined;
}

/**
 * Metadata attached to stored vectors
 */
export interface VectorMetadata {
  /** Source type identifier */
  sourceType?: string | undefined;
  /** Wolke share link identifier */
  wolkeShareLinkId?: string | null | undefined;
  /** Wolke file path */
  wolkeFilePath?: string | null | undefined;
  /** Document title */
  title?: string | null | undefined;
  /** Document filename */
  filename?: string | null | undefined;
  /** Additional custom payload fields */
  additionalPayload?: Record<string, unknown> | undefined;
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
  limit?: number | undefined;
  /** Minimum similarity score threshold */
  scoreThreshold?: number | undefined;
  /** Filter by source type */
  sourceType?: string | null | undefined;
  /** Include full payload in results */
  includePayload?: boolean | undefined;
  /** Enable hybrid search mode */
  hybridMode?: boolean | undefined;
  /** Query text for hybrid mode */
  query?: string | null | undefined;
  /** Hybrid search options */
  hybridOptions?: HybridOptions | undefined;
}

/**
 * Result from user document search
 */
export interface UserDocumentSearchResult {
  success: boolean;
  results: Array<{
    id: string | number;
    score: number;
    payload?: Record<string, unknown> | undefined;
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
  documentId?: string | undefined;
  userId?: string | undefined;
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
  totalCharsReconstructed?: number | undefined;
  error?: string | undefined;
}

/**
 * Individual chunk from a document
 */
export interface DocumentChunkItem {
  index: number;
  text: string;
  tokens: number;
  pageNumber?: number | null | undefined;
}

/** Ein Chunk, wie der Inspektor ihn zeigt — nur, was im Punkt liegt. */
export interface InspectedChunkRow {
  index: number;
  page: number | null;
  text: string;
  charCount: number;
  tokenCount: number | null;
  qualityScore: number | null;
  hasTable: boolean;
  embeddingPresent: boolean;
  sparsePresent: boolean;
}

/**
 * Was die Nutzlast über das Dokument als Ganzes sagt. Für Systemsammlungen ist
 * das die EINZIGE Quelle: dort gibt es keine `documents`-Zeile in Postgres.
 */
export interface InspectedPayloadSummary {
  title: string | null;
  filename: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  extractionMethod: string | null;
  createdAt: string | null;
  maxPage: number | null;
}

export interface InspectDocumentChunksResult {
  success: boolean;
  chunks: InspectedChunkRow[];
  chunkCount: number;
  nextOffset: number | null;
  payload: InspectedPayloadSummary | null;
  error: string | null;
}

/**
 * Result of retrieving individual chunks for a document
 */
export interface DocumentChunksResult {
  success: boolean;
  chunks: DocumentChunkItem[];
  chunkCount: number;
  error?: string | undefined;
}

/** Ein Chunk im Kontext-Fenster; `isCenter` markiert den zitierten. */
export interface ChunkContextItem {
  text: string;
  chunkIndex: number;
  isCenter: boolean;
}

/**
 * Rückgabe von `getChunkWithContext`. Die Form ist F0: qdrantController.ts:406-414
 * reicht `centerChunk`/`contextChunks` unverändert an den Client, wo
 * `ChunkContextData` (apps/web/src/stores/citationStore.ts:28-33) sie erwartet.
 * Optionale Felder werden WEGGELASSEN, nie auf `undefined` gesetzt —
 * apps/api fährt `exactOptionalPropertyTypes`.
 */
export interface ChunkWithContextResult {
  success: boolean;
  centerChunk?: { text: string; chunkIndex: number };
  contextChunks?: ChunkContextItem[];
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
  error?: string | undefined;
}

// ============ Bundestag Search Types ============

/**
 * Options for Bundestag content search
 */
export interface BundestagSearchOptions {
  /** Filter by section */
  section?: string | null | undefined;
  /** Maximum number of results */
  limit?: number | undefined;
  /** Minimum similarity threshold */
  threshold?: number | undefined;
  /** Enable hybrid mode */
  hybridMode?: boolean | undefined;
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
  query?: string | undefined;
  searchType?: string | undefined;
  totalHits?: number | undefined;
  message?: string | undefined;
  error?: string | undefined;
}

// ============ Extended Chunk Types ============

/**
 * Extended raw chunk with quality and URL fields
 */
export interface DocumentRawChunk extends RawChunk {
  quality_score?: number | null | undefined;
  url?: string | undefined;
  searchMethod?: string | undefined;
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
}

/**
 * Extended chunk data with quality information
 */
export interface DocumentChunkData extends ChunkData {
  /** Override to allow null in addition to undefined */
  quality_score?: number | undefined;
  url?: string | undefined;
}

/**
 * Extended transformed chunk with quality and URL
 */
export interface DocumentTransformedChunk extends TransformedChunk {
  quality_score?: number | null | undefined;
  content_type?: string | null | undefined;
  page_number?: number | null | undefined;
  url?: string | undefined;
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
  qualityAvg?: number | undefined;
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
  query?: string | undefined;
  qualityMin?: number | undefined;
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
  user_id?: string | undefined;
  document_id?: string | undefined;
  url?: string | undefined;
  chunk_index?: number | undefined;
  chunk_text?: string | undefined;
  token_count?: number | undefined;
  quality_score?: number | undefined;
  content_type?: string | undefined;
  page_number?: number | undefined;
  /** `'text'` oder `'table'`; fehlt auf Punkten, die vor #3122 geschrieben wurden. */
  chunk_type?: string | undefined;
  created_at?: string | undefined;
  title?: string | undefined;
  filename?: string | undefined;
  source_type?: string | undefined;
  metadata?: {
    title?: string | undefined;
    filename?: string | undefined;
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
  vector?: number[] | null | undefined;
}

/**
 * Qdrant document for scroll operations
 * Compatible with ScrollPoint from QdrantOperations
 */
export interface QdrantDocument {
  id: string | number;
  payload: QdrantResultPayload;
  vector?: number[] | null | undefined;
}

// ============ Hybrid Search Result Types ============

/**
 * Hybrid search result with method tracking
 */
export interface HybridSearchResult {
  results: Array<
    QdrantSearchResult & {
      searchMethod?: string | undefined;
      originalVectorScore?: number | null | undefined;
      originalTextScore?: number | null | undefined;
    }
  >;
  metadata?: {
    hybridMethod?: string | undefined;
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
  DocumentResult,
};
