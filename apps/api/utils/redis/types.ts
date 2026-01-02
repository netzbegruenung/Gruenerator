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
  // Resource configuration
  resources: {
    [resourceType: string]: {
      [userType: string]: ResourceLimitConfig;
    };
  };

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
  count?: number;
  limit?: number;
  remaining?: number;
  canGenerate: boolean;
  unlimited: boolean;
  resourceType?: string;
  userType?: string;
  window?: string;
  identifier?: string;
  error?: boolean;
  development?: boolean;
}

/**
 * Rate limit increment result
 */
export interface RateLimitIncrementResult {
  success: boolean;
  count?: number;
  limit?: number;
  remaining?: number;
  canGenerate?: boolean;
  resourceType?: string;
  userType?: string;
  window?: string;
  unlimited?: boolean;
  limitReached?: boolean;
  error?: boolean;
}

/**
 * OAuth state data stored in Redis
 */
export interface OAuthStateData {
  userId: string;
  codeVerifier?: string;
  returnUrl?: string;
  createdAt?: number;
  expiresAt?: number;
  [key: string]: any;
}

/**
 * OAuth state manager statistics
 */
export interface OAuthStats {
  available: boolean;
  count: number;
  connected?: boolean;
  error?: string;
}

/**
 * LRU Cache entry
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

/**
 * LRU Cache options
 */
export interface CacheOptions {
  name?: string;
  maxSize?: number;
  ttl?: number;
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
    [key: string]: any;
  };
  sessionID?: string;
  ip?: string;
  headers: {
    [key: string]: string | string[] | undefined;
  };
}
