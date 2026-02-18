/**
 * Redis Utilities Barrel Export
 * Provides all Redis-related utilities in one place
 */

// Redis Client exports
export { default as redisClient, redisClient as client } from './client.js';

// Desktop OAuth State Manager exports (for Tauri PKCE auth)
export {
  default as desktopOAuthStateManager,
  DesktopOAuthStateManager,
} from './DesktopOAuthStateManager.js';

// OIDC State Store exports (Redis fallback for privacy browsers)
export { storeOIDCState, consumeOIDCState } from './OIDCStateStore.js';

// Rate Limiter exports
export { default as RateLimiter, RateLimiter as RateLimiterClass } from './RateLimiter.js';

// LRU Cache exports
export { LRUCache, createCache } from './cache.js';

// Type exports
export type * from './types.js';
