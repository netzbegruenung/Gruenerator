/**
 * Vector Search Module
 * Unified vector search infrastructure for API and MCP
 */

// Types
export * from './types.js';

// Constants
export * from './constants.js';

// Core algorithms
export {
  applyReciprocalRankFusion,
  applyWeightedCombination,
  applyQualityGate,
  calculateDynamicThreshold,
  determineFusionStrategy,
  applyQualityBoost,
  calculateTextSearchScore,
} from './HybridSearch.js';

// Quality scoring
export {
  filterByQuality,
  applyQualityBoost as applyQualityScoringBoost,
  searchWithQuality,
  calculateChunkQuality,
  getQualityStats,
} from './QualityScoring.js';

// Intent detection
export {
  detectIntent,
  getContentPreferences,
  generateSearchFilters,
  detectSubcategoryFilters,
  detectDocumentScope,
  QueryIntentService,
  queryIntentService,
} from './IntentDetection.js';

// Chunk context
export {
  getChunkWithContext,
  getBatchChunkContext,
  mergeContextText,
  getContextWindow,
  expandResultsWithContext,
} from './ChunkContext.js';
export type { ChunkContextOptions, QdrantClientLike } from './ChunkContext.js';

// Embedding service
export { EmbeddingService, createEmbeddingService } from './EmbeddingService.js';
export type { MistralClient } from './EmbeddingService.js';
