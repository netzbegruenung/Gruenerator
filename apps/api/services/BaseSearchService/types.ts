/**
 * BaseSearchService Type Definitions
 *
 * Provides TypeScript interfaces for search parameters, results, and scoring.
 */

import type { SearchPatternResult } from './keyword-extractor-types.js';

// ============ Search Parameters ============

export interface SearchFilters {
  documentType?: string | undefined;
  dateRange?: {
    start?: Date | undefined;
    end?: Date | undefined;
  };
  tags?: string[] | undefined;
  [key: string]: unknown;
}

export interface SearchOptions {
  limit?: number | undefined;
  threshold?: number | undefined;
  useCache?: boolean | undefined;
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  useRRF?: boolean | undefined;
  rrfK?: number | undefined;
  recallLimit?: number | undefined;
  [key: string]: unknown;
}

export interface SearchParams {
  query: string;
  userId?: string | undefined;
  filters?: SearchFilters | undefined;
  options?: SearchOptions | undefined;
  /** Flat parameter support for backwards compatibility */
  limit?: number | undefined;
  group_id?: string | null | undefined;
  mode?: 'vector' | 'hybrid' | 'text' | 'keyword' | undefined;
}

export interface ValidatedSearchParams {
  query: string;
  userId: string | null;
  filters: SearchFilters;
  options: Required<Pick<SearchOptions, 'limit' | 'threshold' | 'useCache'>> & SearchOptions;
}

// ============ Chunk Data ============

export interface RawChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  token_count?: number | undefined;
  created_at?: string | undefined;
  content_type?: string | undefined;
  page_number?: number | undefined;
  url?: string | undefined;
  metadata?: {
    content_type?: string | undefined;
    page_number?: number | undefined;
    [key: string]: unknown;
  };
  documents?: {
    id: string;
    title?: string | undefined;
    filename?: string | undefined;
    created_at?: string | undefined;
  };
  document_title?: string | undefined;
  document_filename?: string | undefined;
  document_created_at?: string | undefined;
}

export interface ChunkData {
  chunk_id: string;
  chunk_index: number;
  text: string;
  content_type?: string | null | undefined;
  page_number?: number | null | undefined;
  similarity: number;
  similarity_adjusted?: number | undefined;
  has_term?: boolean | undefined;
  is_toc?: boolean | undefined;
  token_count?: number | undefined;
  quality_score?: number | undefined;
  searchMethod?: string | undefined;
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
}

export interface TransformedChunk {
  id: string | number;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  token_count?: number | undefined;
  created_at?: string | undefined;
  source_id?: string | null | undefined;
  url?: string | undefined;
  documents: {
    id: string;
    title?: string | undefined;
    filename?: string | undefined;
    created_at?: string | undefined;
  };
  searchMethod?: string | undefined;
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
}

// ============ Scoring ============

export interface EnhancedScore {
  finalScore: number;
  maxSimilarity: number;
  avgSimilarity: number;
  positionScore: number;
  diversityBonus: number;
  hybridBonus?: number | undefined;
  qualityAvg?: number | undefined;
}

export interface ScoringConfig {
  maxSimilarityWeight?: number | undefined;
  avgSimilarityWeight?: number | undefined;
  positionWeight?: number | undefined;
  minPositionWeight?: number | undefined;
  positionDecayRate?: number | undefined;
  maxDiversityBonus: number;
  diversityBonusRate: number;
  maxFinalScore?: number | undefined;
  [key: string]: unknown;
}

// ============ Document Results ============

export interface HybridMetadata {
  hasVectorMatch: boolean;
  hasTextMatch: boolean;
  searchMethods: Set<string>;
  vectorScores: number[];
  textScores: number[];
}

export interface DocumentData {
  document_id: string;
  title?: string | undefined;
  filename?: string | undefined;
  created_at?: string | undefined;
  source_url?: string | undefined;
  source_id?: string | null | undefined;
  chunks: ChunkData[];
  maxSimilarity: number;
  avgSimilarity: number;
  totalScore?: number | undefined;
  hybridMetadata?: HybridMetadata | undefined;
}

export interface TopChunk {
  chunk_index: number;
  content_type?: string | null | undefined;
  page_number?: number | null | undefined;
  quality_score?: number | null | undefined;
  has_term?: boolean | undefined;
  preview: string;
}

export interface DocumentResult {
  document_id: string;
  title?: string | undefined;
  filename?: string | undefined;
  created_at?: string | undefined;
  source_url?: string | undefined;
  source_id?: string | null | undefined;
  relevant_content: string;
  similarity_score: number;
  max_similarity: number;
  avg_similarity: number;
  position_score?: number | undefined;
  diversity_bonus?: number | undefined;
  hybrid_bonus?: number | undefined;
  quality_avg?: number | null | undefined;
  chunk_index?: number | null | undefined;
  top_chunks: TopChunk[];
  chunk_count: number;
  relevance_info: string;
  search_methods?: string[] | undefined;
  hybrid_metadata?: {
    hasVectorMatch: boolean;
    hasTextMatch: boolean;
    avgVectorScore: number | null;
    avgTextScore: number | null;
  };
}

// ============ Search Response ============

export interface SearchResponse {
  success: boolean;
  results: DocumentResult[];
  query: string;
  searchType: string;
  message: string;
  error?: string | undefined;
  code?: string | undefined;
  stats?: unknown;
  metadata?: {
    searchService?: string | undefined;
    totalChunks?: number | undefined;
    threshold?: number | undefined;
    cached?: boolean | undefined;
    searchPatterns?: string[] | undefined;
    hybridMethod?: string | undefined;
    processedDocuments?: number | undefined;
  };
}

// ============ Hybrid Search ============

export interface HybridOptions {
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  useRRF?: boolean | undefined;
  rrfK?: number | undefined;
  recallLimit?: number | undefined;
}

export interface HybridChunkParams {
  embedding: number[];
  query: string;
  searchPatterns?: SearchPatternResult | undefined;
  userId?: string | null | undefined;
  filters?: SearchFilters | undefined;
  limit: number;
  threshold: number;
  hybridOptions: HybridOptions;
}

export interface SimilarChunkParams {
  embedding: number[];
  userId?: string | null | undefined;
  filters?: SearchFilters | undefined;
  limit: number;
  threshold: number;
  query?: string | undefined;
}

// ============ RPC Parameters ============

export interface RPCParams {
  query_embedding: string;
  user_id_filter?: string | null | undefined;
  similarity_threshold: number;
  match_count: number;
  [key: string]: unknown;
}

// ============ Cache ============

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

export interface Cache {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  clear(): void;
  getStats(): CacheStats;
}

// ============ Error Handler ============

export interface ErrorHandlerOptions {
  enableTelemetry?: boolean | undefined;
  logLevel?: string | undefined;
}

/**
 * ErrorHandler interface compatible with the class from utils/errors/handlers
 * The handle method can return any error-like response structure
 */
export interface ErrorHandler {
  handle(
    error: Error,
    context: {
      operation: string;
      query?: string | undefined;
      userId?: string | null | undefined;
      returnResponse?: boolean | undefined;
      [key: string]: unknown;
    }
  ): unknown;
}

// ============ Service Options ============

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BaseSearchServiceOptions {
  serviceName?: string | undefined;
  defaultLimit?: number | undefined;
  defaultThreshold?: number | undefined;
  enableTelemetry?: boolean | undefined;
  logLevel?: LogLevel | undefined;
  cacheType?: string | undefined;
  cacheSize?: number | undefined;
  cacheTTL?: number | undefined;
}

// ============ MMR Options ============

export interface MMROptions {
  applyMMR?: boolean | undefined;
  mmrLambda?: number | undefined;
  dossierMode?: boolean | undefined;
}
