/**
 * BaseSearchService Type Definitions
 *
 * Provides TypeScript interfaces for search parameters, results, and scoring.
 */

import type { SearchPatternResult } from './keyword-extractor-types.js';
import type { Request } from 'express';

// ============ Search Parameters ============

export interface SearchFilters {
  documentType?: string;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  tags?: string[];
  [key: string]: unknown;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  useCache?: boolean;
  vectorWeight?: number;
  textWeight?: number;
  useRRF?: boolean;
  rrfK?: number;
  recallLimit?: number;
  [key: string]: unknown;
}

export interface SearchParams {
  query: string;
  userId?: string;
  filters?: SearchFilters;
  options?: SearchOptions;
  /** Flat parameter support for backwards compatibility */
  limit?: number;
  group_id?: string | null;
  mode?: 'vector' | 'hybrid' | 'text' | 'keyword';
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
  token_count?: number;
  created_at?: string;
  content_type?: string;
  page_number?: number;
  metadata?: {
    content_type?: string;
    page_number?: number;
    [key: string]: unknown;
  };
  documents?: {
    id: string;
    title?: string;
    filename?: string;
    created_at?: string;
  };
  document_title?: string;
  document_filename?: string;
  document_created_at?: string;
}

export interface ChunkData {
  chunk_id: string;
  chunk_index: number;
  text: string;
  content_type?: string | null;
  page_number?: number | null;
  similarity: number;
  similarity_adjusted?: number;
  has_term?: boolean;
  is_toc?: boolean;
  token_count?: number;
  quality_score?: number;
  searchMethod?: string;
  originalVectorScore?: number | null;
  originalTextScore?: number | null;
}

export interface TransformedChunk {
  id: string | number;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  token_count?: number;
  created_at?: string;
  documents: {
    id: string;
    title?: string;
    filename?: string;
    created_at?: string;
  };
  searchMethod?: string;
  originalVectorScore?: number | null;
  originalTextScore?: number | null;
}

// ============ Scoring ============

export interface EnhancedScore {
  finalScore: number;
  maxSimilarity: number;
  avgSimilarity: number;
  positionScore: number;
  diversityBonus: number;
  hybridBonus?: number;
  qualityAvg?: number;
}

export interface ScoringConfig {
  maxSimilarityWeight?: number;
  avgSimilarityWeight?: number;
  positionWeight?: number;
  minPositionWeight?: number;
  positionDecayRate?: number;
  maxDiversityBonus: number;
  diversityBonusRate: number;
  maxFinalScore?: number;
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
  title?: string;
  filename?: string;
  created_at?: string;
  source_url?: string;
  chunks: ChunkData[];
  maxSimilarity: number;
  avgSimilarity: number;
  totalScore?: number;
  hybridMetadata?: HybridMetadata;
}

export interface TopChunk {
  chunk_index: number;
  content_type?: string | null;
  page_number?: number | null;
  quality_score?: number | null;
  has_term?: boolean;
  preview: string;
}

export interface DocumentResult {
  document_id: string;
  title?: string;
  filename?: string;
  created_at?: string;
  source_url?: string;
  relevant_content: string;
  similarity_score: number;
  max_similarity: number;
  avg_similarity: number;
  position_score?: number;
  diversity_bonus?: number;
  hybrid_bonus?: number;
  quality_avg?: number | null;
  chunk_index?: number | null;
  top_chunks: TopChunk[];
  chunk_count: number;
  relevance_info: string;
  search_methods?: string[];
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
  error?: string;
  code?: string;
  metadata?: {
    searchService?: string;
    totalChunks?: number;
    threshold?: number;
    cached?: boolean;
    searchPatterns?: string[];
    hybridMethod?: string;
    processedDocuments?: number;
  };
}

// ============ Hybrid Search ============

export interface HybridOptions {
  vectorWeight?: number;
  textWeight?: number;
  useRRF?: boolean;
  rrfK?: number;
  recallLimit?: number;
}

export interface HybridChunkParams {
  embedding: number[];
  query: string;
  searchPatterns?: SearchPatternResult;
  userId?: string | null;
  filters?: SearchFilters;
  limit: number;
  threshold: number;
  hybridOptions: HybridOptions;
}

export interface SimilarChunkParams {
  embedding: number[];
  userId?: string | null;
  filters?: SearchFilters;
  limit: number;
  threshold: number;
  query?: string;
}

// ============ RPC Parameters ============

export interface RPCParams {
  query_embedding: string;
  user_id_filter?: string | null;
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
  enableTelemetry?: boolean;
  logLevel?: string;
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
      query?: string;
      userId?: string | null;
      returnResponse?: boolean;
      [key: string]: unknown;
    }
  ): any;
}

// ============ Service Options ============

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BaseSearchServiceOptions {
  serviceName?: string;
  defaultLimit?: number;
  defaultThreshold?: number;
  enableTelemetry?: boolean;
  logLevel?: LogLevel;
  cacheType?: string;
  cacheSize?: number;
  cacheTTL?: number;
}

// ============ MMR Options ============

export interface MMROptions {
  applyMMR?: boolean;
  mmrLambda?: number;
  dossierMode?: boolean;
}
