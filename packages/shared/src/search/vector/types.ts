/**
 * Vector Search Types
 * Shared type definitions for vector search across API and MCP
 */

export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  title?: string;
  text?: string;
  url?: string | null;
  documentId?: string;
  filename?: string;
  qualityScore?: number;
  searchMethod?: 'vector' | 'text' | 'hybrid';
  matchType?: 'exact' | 'variant' | 'token_fallback' | 'none';
}

export interface HybridSearchMetadata {
  vectorResults: number;
  textResults: number;
  fusionMethod: 'RRF' | 'weighted';
  vectorWeight?: number;
  textWeight?: number;
  dynamicThreshold?: number;
  hasTextMatches: boolean;
  qualityFiltered?: boolean;
  autoSwitchedFromRRF?: boolean;
  textMatchTypes?: string[];
}

export interface HybridSearchResponse {
  success: boolean;
  results: VectorSearchResult[];
  metadata: HybridSearchMetadata;
}

export interface TextSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  matchType: 'exact' | 'variant' | 'token_fallback';
  matchedVariant?: string;
}

export interface QdrantFilter {
  must?: Array<Record<string, unknown>>;
  must_not?: Array<Record<string, unknown>>;
  should?: Array<Record<string, unknown>>;
}

export interface HybridSearchOptions {
  limit?: number;
  threshold?: number;
  vectorWeight?: number;
  textWeight?: number;
  useRRF?: boolean;
  rrfK?: number;
  filter?: QdrantFilter | null;
  recallLimit?: number;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  withPayload?: boolean;
  withVector?: boolean;
  ef?: number;
}

export interface QualityConfig {
  enabled: boolean;
  minChunkQuality: number;
  weights: {
    readability: number;
    completeness: number;
    structure: number;
    density: number;
  };
  retrieval: {
    enableQualityFilter: boolean;
    minRetrievalQuality: number;
    qualityBoostFactor: number;
  };
}

export interface HybridConfig {
  enableDynamicThresholds: boolean;
  enableQualityGate: boolean;
  enableConfidenceWeighting: boolean;
  minVectorWithTextThreshold: number;
  minVectorOnlyThreshold: number;
  minFinalScore: number;
  minVectorOnlyFinalScore: number;
  confidenceBoost: number;
  confidencePenalty: number;
}

export interface QueryIntent {
  type: string;
  language: 'de' | 'en' | 'unknown';
  confidence: number;
  keywords?: string[];
  flags?: {
    hasNumbers?: boolean;
  };
}

export interface DocumentScope {
  collections: string[];
  documentTitleFilter: string | null;
  detectedPhrase: string | null;
  subcategoryFilters: Record<string, string>;
}

export interface ChunkContext {
  center: VectorSearchResult | null;
  context: VectorSearchResult[];
}

export interface EmbeddingOptions {
  model?: string;
  maxRetries?: number;
}

export interface BatchEmbeddingOptions extends EmbeddingOptions {
  maxBatchSize?: number;
  maxTokensPerBatch?: number;
  delayBetweenBatches?: number;
}
