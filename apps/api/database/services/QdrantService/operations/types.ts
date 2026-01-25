/**
 * TypeScript interfaces for QdrantOperations
 * Higher-level search algorithms and operations
 */

import type { QdrantFilter, CollectionStats } from '../types.js';

// Search options
export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  withPayload?: boolean;
  withVector?: boolean;
  ef?: number | null;
}

export interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number;
  textWeight?: number;
  useRRF?: boolean;
  rrfK?: number;
  recallLimit?: number;
}

export interface ContextOptions {
  window?: number;
}

// Search results
export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[] | null;
}

export interface TextSearchResult extends VectorSearchResult {
  searchMethod: 'text';
  searchTerm: string;
  matchedVariant?: string;
  matchType?: 'exact' | 'variant' | 'token_fallback' | 'none' | 'error';
}

export interface HybridSearchResult extends VectorSearchResult {
  searchMethod: 'vector' | 'text' | 'hybrid';
  originalVectorScore?: number | null;
  originalTextScore?: number | null;
  confidence?: number;
  rawRRFScore?: number;
}

export interface HybridSearchMetadata {
  vectorResults: number;
  textResults: number;
  fusionMethod: 'RRF' | 'weighted';
  vectorWeight: number;
  textWeight: number;
  dynamicThreshold: number;
  qualityFiltered: boolean;
  autoSwitchedFromRRF: boolean;
  hasRealTextMatches: boolean;
  textMatchTypes: string[];
}

export interface HybridSearchResponse {
  success: boolean;
  results: HybridSearchResult[];
  metadata: HybridSearchMetadata;
}

// Context retrieval
export interface ChunkWithContext {
  center: {
    id: string | number;
    payload: Record<string, unknown>;
  } | null;
  context: Array<{
    id: string | number;
    payload: Record<string, unknown>;
  }>;
}

// Batch operations
export interface BatchUpsertOptions {
  wait?: boolean;
  maxRetries?: number;
}

export interface BatchUpsertResult {
  success: boolean;
  pointsUpserted: number;
  collection: string;
}

export interface BatchDeleteResult {
  success: boolean;
  collection: string;
}

export interface ScrollOptions {
  limit?: number;
  withPayload?: boolean;
  withVector?: boolean;
  offset?: string | number | null;
}

export interface ScrollPoint {
  id: string | number;
  payload: Record<string, unknown>;
  vector?: number[] | null;
}

// Hybrid config interface (from vectorConfig)
export interface HybridConfig {
  enableDynamicThresholds: boolean;
  minVectorWithTextThreshold: number;
  minVectorOnlyThreshold: number;
  enableQualityGate: boolean;
  minFinalScore: number;
  minVectorOnlyFinalScore: number;
  enableConfidenceWeighting: boolean;
  confidencePenalty: number;
  confidenceBoost: number;
}

// Quality config interface
export interface QualityConfig {
  retrieval?: {
    enableQualityFilter?: boolean;
    minRetrievalQuality?: number;
    qualityBoostFactor?: number;
  };
}

// RRF scoring intermediate
export interface RRFScoringItem {
  item: VectorSearchResult | TextSearchResult;
  rrfScore: number;
  vectorRank: number | null;
  textRank: number | null;
  originalVectorScore: number | null;
  originalTextScore: number | null;
  searchMethod: 'vector' | 'text' | 'hybrid';
  confidence: number;
  finalScore?: number;
}

// Weighted scoring intermediate
export interface WeightedScoringItem {
  item: VectorSearchResult | TextSearchResult;
  vectorScore: number;
  textScore: number;
  originalVectorScore: number | null;
  originalTextScore: number | null;
  searchMethod: 'vector' | 'text' | 'hybrid';
}

// Variant search result
export interface VariantSearchResult {
  variant: string;
  points: Array<{
    id: string | number;
    payload: Record<string, unknown>;
  }>;
  matchType: 'exact' | 'variant' | 'error';
}

// Re-export commonly used types
export type { QdrantFilter, CollectionStats };
