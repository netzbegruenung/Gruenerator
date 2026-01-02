/**
 * Counter Services
 * Utilities for counting tokens, image generations, and privacy mode requests
 */

// Class exports
export { TokenCounter, tokenCounter } from './TokenCounter.js';
export { ImageGenerationCounter } from './ImageGenerationCounter.js';
export { PrivacyCounter } from './PrivacyCounter.js';

// Named function exports from TokenCounter (backward compatibility)
export {
  countTokens,
  countMessageTokens,
  trimMessagesToTokenLimit,
  getTokenStats,
  exceedsTokenLimit,
  formatTokenCount
} from './TokenCounter.js';

// Default exports for backward compatibility
export { default as ImageGenerationCounterClass } from './ImageGenerationCounter.js';
export { default as PrivacyCounterClass } from './PrivacyCounter.js';

// Type exports
export type {
  Message,
  TokenStats,
  ImageGenerationStatus,
  ImageGenerationResult,
  RedisClient
} from './types.js';
