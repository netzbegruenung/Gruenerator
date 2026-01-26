/**
 * MistralEmbeddingService Module Exports
 *
 * Barrel export file for MistralEmbeddingService module.
 * Provides clean API surface for external consumers.
 */

// Main class
export { MistralEmbeddingService } from './MistralEmbeddingService.js';

// Re-export MistralEmbeddingClient
export { MistralEmbeddingClient } from './MistralEmbeddingClient.js';
export type { MistralEmbeddingOptions, RetryableError } from './MistralEmbeddingClient.js';

// Re-export all type definitions
export type {
  ModelInfo,
  EmbeddingOptions,
  EmbeddingResult,
  BatchEmbeddingResult,
  CacheConfig,
  CacheStats,
  RedisClient,
  ServiceState,
} from './types.js';

// Export validation utilities and embedding operations (if needed externally)
export {
  validateText,
  validateTexts,
  estimateTokenCount,
  generateSingleEmbedding,
  generateBatchEmbeddings,
  generateMockEmbedding,
  generateMockBatchEmbeddings,
} from './embeddingOperations.js';

// Export embedding cache singleton and class
export { embeddingCache, EmbeddingCache } from './embeddingCache.js';

// Create and export singleton instance
import { MistralEmbeddingService } from './MistralEmbeddingService.js';
export const mistralEmbeddingService = new MistralEmbeddingService();

// Default export
export { MistralEmbeddingService as default } from './MistralEmbeddingService.js';
