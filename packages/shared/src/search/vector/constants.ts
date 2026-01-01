/**
 * Vector Search Constants
 * Shared configuration values for vector search across API and MCP
 */

import type { HybridConfig, QualityConfig } from './types';

/**
 * Default hybrid search configuration
 * These values are tuned for RRF with k=60
 */
export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  enableDynamicThresholds: true,
  enableQualityGate: true,
  enableConfidenceWeighting: true,
  minVectorWithTextThreshold: 0.3,
  minVectorOnlyThreshold: 0.5,
  minFinalScore: 0.008,
  minVectorOnlyFinalScore: 0.01,
  confidenceBoost: 1.2,
  confidencePenalty: 0.7,
};

/**
 * Default quality scoring configuration
 */
export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  enabled: true,
  minChunkQuality: 0.3,
  weights: {
    readability: 0.3,
    completeness: 0.25,
    structure: 0.25,
    density: 0.2,
  },
  retrieval: {
    enableQualityFilter: true,
    minRetrievalQuality: 0.4,
    qualityBoostFactor: 1.2,
  },
};

/**
 * RRF (Reciprocal Rank Fusion) constant
 * Standard value from the literature
 */
export const RRF_K = 60;

/**
 * Default search limits and thresholds
 */
export const SEARCH_DEFAULTS = {
  limit: 5,
  maxLimit: 100,
  threshold: 0.3,
  minThreshold: 0.2,
  maxThreshold: 0.8,
  chunkMultiplier: 3.0,
};

/**
 * Recall limits for hybrid search
 * How many results to retrieve before fusion
 */
export const RECALL_MULTIPLIERS = {
  text: 4,
  vector: 6,
};

/**
 * Text search minimum token length for fallback
 */
export const MIN_TOKEN_LENGTH = 4;

/**
 * Embedding configuration
 */
export const EMBEDDING_DEFAULTS = {
  model: 'mistral-embed',
  dimensions: 1024,
  maxBatchSize: 16,
  maxTokensPerBatch: 8000,
  delayBetweenBatches: 100,
  maxRetries: 3,
  retryBaseDelay: 1000,
};

/**
 * Cache configuration defaults
 */
export const CACHE_DEFAULTS = {
  embeddings: {
    maxSize: 100,
    ttlMs: 10 * 60 * 1000, // 10 minutes
  },
  searchResults: {
    maxSize: 200,
    ttlMs: 5 * 60 * 1000, // 5 minutes
  },
};

/**
 * Weighted combination defaults when RRF is disabled
 */
export const WEIGHTED_FUSION_DEFAULTS = {
  vectorWeight: 0.7,
  textWeight: 0.3,
  vectorOnlyWeight: 0.85,
  textOnlyWeight: 0.15,
};

/**
 * Threshold for switching from RRF to weighted fusion
 */
export const MIN_TEXT_RESULTS_FOR_RRF = 3;

/**
 * Content type preferences by query intent
 */
export const INTENT_CONTENT_PREFERENCES: Record<string, { preferredTypes: string[]; boost: Record<string, number> }> = {
  definition: { preferredTypes: ['heading', 'paragraph'], boost: { heading: 1.2 } },
  howto: { preferredTypes: ['list', 'paragraph'], boost: { list: 1.3 } },
  factual: { preferredTypes: ['paragraph', 'table'], boost: { table: 1.1 } },
  comparison: { preferredTypes: ['table', 'list'], boost: { table: 1.3, list: 1.1 } },
  legal: { preferredTypes: ['paragraph', 'heading'], boost: { paragraph: 1.2 } },
  list: { preferredTypes: ['list', 'heading'], boost: { list: 1.4 } },
  table: { preferredTypes: ['table', 'paragraph'], boost: { table: 1.5 } },
  code: { preferredTypes: ['code', 'list'], boost: { code: 1.6 } },
  summary: { preferredTypes: ['paragraph', 'heading'], boost: { paragraph: 1.2 } },
  timeline: { preferredTypes: ['list', 'paragraph'], boost: { list: 1.2 } },
  general: { preferredTypes: ['paragraph', 'heading'], boost: {} },
};
