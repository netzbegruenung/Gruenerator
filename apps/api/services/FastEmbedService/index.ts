/**
 * FastEmbedService Module Exports
 *
 * Barrel export file for FastEmbedService module.
 * Provides clean API surface for external consumers.
 */

// Main class
export { FastEmbedService } from './FastEmbedService.js';

// Re-export all type definitions
export type {
  ModelInfo,
  EmbeddingOptions,
  EmbeddingResult,
  BatchEmbeddingResult,
  CacheConfig,
  ServiceState
} from './types.js';

// Export validation utilities (if needed externally)
export { validateText, validateTexts, estimateTokenCount } from './validation.js';

// Export caching operations (if needed externally)
export { generateQueryEmbeddingWithCache } from './caching.js';

// Export embedding operations (if needed externally)
export {
  generateSingleEmbedding,
  generateBatchEmbeddings,
  generateMockEmbedding,
  generateMockBatchEmbeddings
} from './embeddingOperations.js';

// Create and export singleton instance (for backward compatibility)
import { FastEmbedService } from './FastEmbedService.js';
export const fastEmbedService = new FastEmbedService();

// Default export
export { FastEmbedService as default } from './FastEmbedService.js';
