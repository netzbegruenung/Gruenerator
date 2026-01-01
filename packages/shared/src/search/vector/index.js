/**
 * Vector Search Module - JavaScript Exports
 * Core search algorithms for API and MCP
 */

// Constants
export {
  DEFAULT_HYBRID_CONFIG,
  DEFAULT_QUALITY_CONFIG,
  RRF_K,
  SEARCH_DEFAULTS,
  RECALL_MULTIPLIERS,
  MIN_TOKEN_LENGTH,
  EMBEDDING_DEFAULTS,
  CACHE_DEFAULTS,
  WEIGHTED_FUSION_DEFAULTS,
  MIN_TEXT_RESULTS_FOR_RRF,
  INTENT_CONTENT_PREFERENCES,
} from './constants.js';

// Hybrid search algorithms
export {
  applyReciprocalRankFusion,
  applyWeightedCombination,
  applyQualityGate,
  calculateDynamicThreshold,
  determineFusionStrategy,
  applyQualityBoost,
  calculateTextSearchScore,
} from './HybridSearch.js';
