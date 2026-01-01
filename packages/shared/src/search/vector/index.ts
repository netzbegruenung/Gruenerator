/**
 * Vector Search Module
 * Unified vector search infrastructure for API and MCP
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Core algorithms
export {
  applyReciprocalRankFusion,
  applyWeightedCombination,
  applyQualityGate,
  calculateDynamicThreshold,
  determineFusionStrategy,
  applyQualityBoost,
  calculateTextSearchScore,
} from './HybridSearch';

// Quality scoring
export {
  filterByQuality,
  applyQualityBoost as applyQualityScoringBoost,
  searchWithQuality,
  calculateChunkQuality,
  getQualityStats,
} from './QualityScoring';

// Intent detection
export {
  detectIntent,
  getContentPreferences,
  generateSearchFilters,
  detectSubcategoryFilters,
  detectDocumentScope,
  QueryIntentService,
  queryIntentService,
} from './IntentDetection';

// Chunk context
export {
  getChunkWithContext,
  getBatchChunkContext,
  mergeContextText,
  getContextWindow,
  expandResultsWithContext,
} from './ChunkContext';
export type { ChunkContextOptions, QdrantClientLike } from './ChunkContext';

// Embedding service
export {
  EmbeddingService,
  createEmbeddingService,
} from './EmbeddingService';
export type { MistralClient } from './EmbeddingService';
