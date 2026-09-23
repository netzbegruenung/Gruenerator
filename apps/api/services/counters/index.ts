/**
 * Counter Services
 * Utilities for counting tokens. The daily image/speech/deep-research quotas
 * that used to live here are one tree budget now — see `services/trees/`.
 */

// Class exports
export { TokenCounter, tokenCounter } from './TokenCounter.js';

// Named function exports from TokenCounter (backward compatibility)
export {
  countTokens,
  countMessageTokens,
  trimMessagesToTokenLimit,
  getTokenStats,
  exceedsTokenLimit,
  formatTokenCount,
} from './TokenCounter.js';

// Type exports
export type { Message, TokenStats, RedisClient } from './types.js';
