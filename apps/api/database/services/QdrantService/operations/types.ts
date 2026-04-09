/**
 * TypeScript interfaces for QdrantOperations
 * Higher-level search algorithms and operations
 */

import type { QdrantFilter, CollectionStats } from '../types.js';

// Search options
export interface VectorSearchOptions {
  limit?: number | undefined;
  threshold?: number | undefined;
  withPayload?: boolean | undefined;
  withVector?: boolean | undefined;
  ef?: number | null | undefined;
}

export interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  useRRF?: boolean | undefined;
  rrfK?: number | undefined;
  recallLimit?: number | undefined;
}

export interface ContextOptions {
  window?: number | undefined;
}

// Search results
export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[] | null | undefined;
}

export interface TextSearchResult extends VectorSearchResult {
  searchMethod: 'text';
  searchTerm: string;
  matchedVariant?: string | undefined;
  matchType?: 'exact' | 'variant' | 'token_fallback' | 'none' | 'error' | undefined;
}

export interface HybridSearchResult extends VectorSearchResult {
  searchMethod: 'vector' | 'text' | 'hybrid';
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
  confidence?: number | undefined;
  rawRRFScore?: number | undefined;
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
  wait?: boolean | undefined;
  maxRetries?: number | undefined;
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
  limit?: number | undefined;
  withPayload?: boolean | undefined;
  withVector?: boolean | undefined;
  offset?: string | number | null | undefined;
}

export interface ScrollPoint {
  id: string | number;
  payload: Record<string, unknown>;
  vector?: number[] | null | undefined;
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
    enableQualityFilter?: boolean | undefined;
    minRetrievalQuality?: number | undefined;
    qualityBoostFactor?: number | undefined;
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
  finalScore?: number | undefined;
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
