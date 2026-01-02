/**
 * Embedding Cache Service
 *
 * Redis-backed caching for query embeddings.
 * Provides significant performance improvements for repeated queries.
 */

import crypto from 'crypto';
import type { CacheStats, RedisClient } from './types.js';

class EmbeddingCache {
  private ttl: number;
  private keyPrefix: string;
  private redis: RedisClient | null;
  private initialized: boolean;

  constructor() {
    this.ttl = 86400; // 24 hour cache
    this.keyPrefix = 'embedding:';
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection using existing client
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Use existing Redis client via dynamic ESM-compatible import
      let redisClient: RedisClient | null = null;
      try {
        const mod = await import('../../../utils/redis/index.js');
        // Support named export from utils/redis/index
        redisClient = mod.redisClient as unknown as RedisClient | null;
      } catch (e) {
        const error = e as Error;
        console.warn('[EmbeddingCache] Failed to import Redis client:', error.message);
      }

      if (redisClient && redisClient.isReady) {
        this.redis = redisClient;
        console.log('[EmbeddingCache] Using existing Redis connection');
      } else if (redisClient) {
        // Wait for connection if not ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);

          if (redisClient!.isReady) {
            clearTimeout(timeout);
            resolve();
          } else {
            redisClient!.once('ready', () => {
              clearTimeout(timeout);
              resolve();
            });
            redisClient!.once('error', (err: unknown) => {
              clearTimeout(timeout);
              reject(err);
            });
          }
        });

        this.redis = redisClient;
        console.log('[EmbeddingCache] Connected to existing Redis client');
      } else {
        console.warn('[EmbeddingCache] Redis client not available, caching disabled');
      }
    } catch (error) {
      const err = error as Error;
      console.warn('[EmbeddingCache] Redis not available, caching disabled:', err.message);
    }

    this.initialized = true;
  }

  /**
   * Generate cache key for a query
   */
  private generateCacheKey(query: string): string {
    const hash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
    return `${this.keyPrefix}${hash}`;
  }

  /**
   * Get cached embedding for a query
   */
  async getCachedEmbedding(query: string): Promise<number[] | null> {
    await this.initialize();

    if (!this.redis) {
      return null;
    }

    try {
      const key = this.generateCacheKey(query);
      const cached = await this.redis.get(key);

      if (cached) {
        const embedding = JSON.parse(cached) as number[];
        console.log(`[EmbeddingCache] Cache HIT for "${query.substring(0, 50)}..."`);
        return embedding;
      }

      console.log(`[EmbeddingCache] Cache MISS for "${query.substring(0, 50)}..."`);
      return null;
    } catch (error) {
      console.error('[EmbeddingCache] Error retrieving from cache:', error);
      return null;
    }
  }

  /**
   * Cache an embedding for a query
   */
  async cacheEmbedding(query: string, embedding: number[]): Promise<boolean> {
    await this.initialize();

    if (!this.redis || !embedding || !Array.isArray(embedding)) {
      return false;
    }

    try {
      const key = this.generateCacheKey(query);
      await this.redis.setEx(key, this.ttl, JSON.stringify(embedding));
      console.log(`[EmbeddingCache] Cached embedding for "${query.substring(0, 50)}..."`);
      return true;
    } catch (error) {
      console.error('[EmbeddingCache] Error caching embedding:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.initialize();

    if (!this.redis) {
      return { enabled: false, keys: 0 };
    }

    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const info = await this.redis.info('memory');

      return {
        enabled: true,
        keys: keys.length,
        memoryInfo: info
      };
    } catch (error) {
      const err = error as Error;
      console.error('[EmbeddingCache] Error getting stats:', error);
      return { enabled: false, keys: 0, error: err.message };
    }
  }

  /**
   * Clear all cached embeddings
   */
  async clearCache(): Promise<boolean> {
    await this.initialize();

    if (!this.redis) {
      return false;
    }

    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(keys);
        console.log(`[EmbeddingCache] Cleared ${keys.length} cached embeddings`);
      }
      return true;
    } catch (error) {
      console.error('[EmbeddingCache] Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Disconnect from shared Redis client
   */
  async close(): Promise<void> {
    // Don't close the shared Redis client, just release reference
    this.redis = null;
    this.initialized = false;
    console.log('[EmbeddingCache] Disconnected from shared Redis client');
  }
}

// Export singleton instance
export const embeddingCache = new EmbeddingCache();

// Export class for testing
export { EmbeddingCache };
