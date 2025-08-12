/**
 * LRU Cache implementation with TTL support
 * Replaces problematic unbounded memory caches throughout the vector backend
 */
class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.cache = new Map();
    this.name = options.name || 'LRUCache';
    
    // Cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.ttl / 4); // Cleanup every quarter of TTL
    
    // Track cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      cleanups: 0
    };
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.deletes++;
      return null;
    }
    
    // Move to end (mark as recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;
    
    return entry.data;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.deletes++;
    }
    
    // Remove existing entry if present (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Add new entry
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
    
    this.stats.sets++;
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.deletes++;
      return false;
    }
    
    return true;
  }

  /**
   * Delete specific key
   * @param {string} key - Cache key to delete
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const existed = this.cache.delete(key);
    if (existed) {
      this.stats.deletes++;
    }
    return existed;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.stats.cleanups++;
      this.stats.deletes += removedCount;
      console.log(`[${this.name}] Cleanup: removed ${removedCount} expired entries`);
    }
  }

  /**
   * Get cache size
   * @returns {number} Current cache size
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses);
    return {
      ...this.stats,
      hitRate: isNaN(hitRate) ? 0 : hitRate,
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      name: this.name
    };
  }

  /**
   * Clean up intervals on destruction
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Create cache with predefined configurations
 */
const createCache = {
  /**
   * Create search query enhancement cache
   */
  searchEnhancement: () => new LRUCache({
    name: 'SearchEnhancement',
    maxSize: parseInt(process.env.SEARCH_CACHE_SIZE || '100'),
    ttl: parseInt(process.env.SEARCH_CACHE_TTL || '1800000') // 30 minutes
  }),

  /**
   * Create autonomous search results cache
   */
  searchResults: () => new LRUCache({
    name: 'SearchResults', 
    maxSize: parseInt(process.env.RESULTS_CACHE_SIZE || '200'),
    ttl: parseInt(process.env.RESULTS_CACHE_TTL || '900000') // 15 minutes
  }),

  /**
   * Create embedding cache
   */
  embeddings: () => new LRUCache({
    name: 'Embeddings',
    maxSize: parseInt(process.env.EMBEDDING_CACHE_SIZE || '500'),
    ttl: parseInt(process.env.EMBEDDING_CACHE_TTL || '3600000') // 1 hour
  }),

  /**
   * Create general purpose cache
   */
  general: (options = {}) => new LRUCache({
    name: options.name || 'General',
    maxSize: options.maxSize || 50,
    ttl: options.ttl || 1800000 // 30 minutes
  })
};

module.exports = {
  LRUCache,
  createCache
};