import crypto from 'crypto';

/**
 * Embedding cache service using existing Redis client for caching query embeddings
 * Provides significant performance improvements for repeated queries
 */
class EmbeddingCache {
  constructor() {
    this.ttl = 3600; // 1 hour cache
    this.keyPrefix = 'embedding:';
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection using existing client
   * @private
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Use existing Redis client via dynamic ESM-compatible import
      let redisClient = null;
      try {
        const mod = await import('../utils/redisClient.js');
        // Support both CJS (module.exports) and ESM default exports
        redisClient = mod?.default ?? mod;
      } catch (e) {
        // If import fails, treat as unavailable and fall through to warning
        console.warn('[EmbeddingCache] Failed to import Redis client:', e.message);
      }
      
      if (redisClient && redisClient.isReady) {
        this.redis = redisClient;
        console.log('[EmbeddingCache] Using existing Redis connection');
      } else if (redisClient) {
        // Wait for connection if not ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
          
          if (redisClient.isReady) {
            clearTimeout(timeout);
            resolve();
          } else {
            redisClient.once('ready', () => {
              clearTimeout(timeout);
              resolve();
            });
            redisClient.once('error', (err) => {
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
      console.warn('[EmbeddingCache] Redis not available, caching disabled:', error.message);
    }
    
    this.initialized = true;
  }

  /**
   * Generate cache key for a query
   * @param {string} query - Search query
   * @returns {string} Cache key
   * @private
   */
  generateCacheKey(query) {
    const hash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
    return `${this.keyPrefix}${hash}`;
  }

  /**
   * Get cached embedding for a query
   * @param {string} query - Search query
   * @returns {Promise<Array|null>} Cached embedding or null if not found
   */
  async getCachedEmbedding(query) {
    await this.initialize();
    
    if (!this.redis) {
      return null;
    }

    try {
      const key = this.generateCacheKey(query);
      const cached = await this.redis.get(key);
      
      if (cached) {
        const embedding = JSON.parse(cached);
        console.log(`[EmbeddingCache] Cache HIT for query: "${query}"`);
        return embedding;
      }
      
      console.log(`[EmbeddingCache] Cache MISS for query: "${query}"`);
      return null;
    } catch (error) {
      console.error('[EmbeddingCache] Error retrieving from cache:', error);
      return null;
    }
  }

  /**
   * Cache an embedding for a query
   * @param {string} query - Search query
   * @param {Array} embedding - Embedding vector
   * @returns {Promise<boolean>} Success status
   */
  async cacheEmbedding(query, embedding) {
    await this.initialize();
    
    if (!this.redis || !embedding || !Array.isArray(embedding)) {
      return false;
    }

    try {
      const key = this.generateCacheKey(query);
      await this.redis.setEx(key, this.ttl, JSON.stringify(embedding));
      console.log(`[EmbeddingCache] Cached embedding for query: "${query}"`);
      return true;
    } catch (error) {
      console.error('[EmbeddingCache] Error caching embedding:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
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
      console.error('[EmbeddingCache] Error getting stats:', error);
      return { enabled: false, keys: 0, error: error.message };
    }
  }

  /**
   * Clear all cached embeddings
   * @returns {Promise<boolean>} Success status
   */
  async clearCache() {
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
   * Close Redis connection (not needed since we use shared client)
   */
  async close() {
    // Don't close the shared Redis client
    this.redis = null;
    this.initialized = false;
    console.log('[EmbeddingCache] Disconnected from shared Redis client');
  }
}

// Export singleton instance
export const embeddingCache = new EmbeddingCache();
