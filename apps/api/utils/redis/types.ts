/**
 * Redis Utilities Type Definitions
 * Shared types for all Redis-related utilities
 */

import type { RedisClientType } from 'redis';

/**
 * Redis client type (re-export from redis package)
 */
export type RedisClient = RedisClientType;

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  // Resource configuration - flexible to accept any structure with resource limits
  resources: Record<string, Record<string, ResourceLimitConfig>>;

  // General settings
  redisKeyPrefix: string;
  allowOnRedisError: boolean;
  enableAnalytics: boolean;
  anonymousIdentifierStrategy: ('sessionID' | 'ip')[];

  // Development settings
  development: {
    enabled: boolean;
    multiplier: number;
  };
}

/**
 * Resource limit configuration
 */
export interface ResourceLimitConfig {
  limit: number;
  window: 'daily' | 'hourly' | 'monthly';
}

/**
 * Rate limit check status
 */
export interface RateLimitStatus {
  count?: number | undefined;
  limit?: number | undefined;
  remaining?: number | undefined;
  canGenerate: boolean;
  unlimited: boolean;
  resourceType?: string | undefined;
  userType?: string | undefined;
  window?: string | undefined;
  identifier?: string | undefined;
  error?: boolean | undefined;
  development?: boolean | undefined;
}

/**
 * Rate limit increment result
 */
export interface RateLimitIncrementResult {
  success: boolean;
  count?: number | undefined;
  limit?: number | undefined;
  remaining?: number | undefined;
  canGenerate?: boolean | undefined;
  resourceType?: string | undefined;
  userType?: string | undefined;
  window?: string | undefined;
  unlimited?: boolean | undefined;
  limitReached?: boolean | undefined;
  error?: boolean | undefined;
}

/**
 * OAuth state data stored in Redis
 */
export interface OAuthStateData {
  userId: string;
  codeVerifier?: string | undefined;
  returnUrl?: string | undefined;
  createdAt?: number | undefined;
  expiresAt?: number | undefined;
  [key: string]: unknown;
}

/**
 * OAuth state manager statistics
 */
export interface OAuthStats {
  available: boolean;
  count: number;
  connected?: boolean | undefined;
  error?: string | undefined;
}

/**
 * Desktop OAuth PKCE state data stored in Redis
 */
export interface DesktopOAuthStateData {
  state_id: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  user_agent?: string | undefined;
  created_at: number;
  expires_at: number;
}

/**
 * LRU Cache entry
 */
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

/**
 * LRU Cache options
 */
export interface CacheOptions {
  name?: string | undefined;
  maxSize?: number | undefined;
  ttl?: number | undefined;
}

/**
 * LRU Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  cleanups: number;
  hitRate: number;
  size: number;
  maxSize: number;
  ttl: number;
  name: string;
}

/**
 * Express request with user context (for rate limiting)
 */
export interface RequestWithUser {
  user?: {
    id: string;
  };
  sessionID?: string | undefined;
  ip?: string | undefined;
  headers: {
    [key: string]: string | string[] | undefined;
  };
}
