/**
 * Semantic Cache for search results
 * Caches embeddings and search results with TTL
 */

import { normalizeQuery } from '@gruenerator/shared/utils';

// Cache configuration
const CACHE_CONFIG = {
  embeddingTTL: 10 * 60 * 1000, // 10 minutes for embeddings
  searchTTL: 5 * 60 * 1000, // 5 minutes for search results
  maxEmbeddingEntries: 100,
  maxSearchEntries: 200,
};

// In-memory caches
interface CacheEntry<T> {
  timestamp: number;
  embedding?: T;
  results?: T;
}

const embeddingCache = new Map<string, CacheEntry<number[]>>();
const searchCache = new Map<string, CacheEntry<unknown>>();

// Cache statistics
const stats = {
  embeddingHits: 0,
  embeddingMisses: 0,
  searchHits: 0,
  searchMisses: 0,
};

/**
 * Generate cache key for embedding
 */
function getEmbeddingKey(query: string): string {
  return normalizeQuery(query);
}

/**
 * Generate cache key for search
 */
function getSearchKey(
  collection: string,
  query: string,
  searchMode: string,
  filters: Record<string, string> | null | undefined
): string {
  const normalizedQuery = normalizeQuery(query);
  const filterStr = filters ? JSON.stringify(filters) : '';
  return `${collection}:${searchMode}:${normalizedQuery}:${filterStr}`;
}

/**
 * Clean expired entries from cache
 */
function cleanCache<T>(cache: Map<string, CacheEntry<T>>, ttl: number): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > ttl) {
      cache.delete(key);
    }
  }
}

/**
 * Evict oldest entries if cache is full
 */
function evictIfFull<T>(cache: Map<string, CacheEntry<T>>, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const sortedEntries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(maxEntries * 0.2);
    for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      if (entry) cache.delete(entry[0]);
    }
  }
}

/**
 * Get cached embedding or null
 */
export function getCachedEmbedding(query: string): number[] | null {
  cleanCache(embeddingCache, CACHE_CONFIG.embeddingTTL);

  const key = getEmbeddingKey(query);
  const entry = embeddingCache.get(key);

  if (entry && Date.now() - entry.timestamp < CACHE_CONFIG.embeddingTTL) {
    stats.embeddingHits++;
    return entry.embedding ?? null;
  }

  stats.embeddingMisses++;
  return null;
}

/**
 * Cache an embedding
 */
export function cacheEmbedding(query: string, embedding: number[]): void {
  evictIfFull(embeddingCache, CACHE_CONFIG.maxEmbeddingEntries);

  const key = getEmbeddingKey(query);
  embeddingCache.set(key, {
    embedding,
    timestamp: Date.now(),
  });
}

/**
 * Get cached search results or null
 */
export function getCachedSearch(
  collection: string,
  query: string,
  searchMode: string,
  filters: Record<string, string> | null = null
): unknown {
  cleanCache(searchCache, CACHE_CONFIG.searchTTL);

  const key = getSearchKey(collection, query, searchMode, filters);
  const entry = searchCache.get(key);

  if (entry && Date.now() - entry.timestamp < CACHE_CONFIG.searchTTL) {
    stats.searchHits++;
    return entry.results;
  }

  stats.searchMisses++;
  return null;
}

/**
 * Cache search results
 */
export function cacheSearch(
  collection: string,
  query: string,
  searchMode: string,
  results: unknown,
  filters: Record<string, string> | null = null
): void {
  evictIfFull(searchCache, CACHE_CONFIG.maxSearchEntries);

  const key = getSearchKey(collection, query, searchMode, filters);
  searchCache.set(key, {
    results,
    timestamp: Date.now(),
  });
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const embeddingHitRate =
    stats.embeddingHits + stats.embeddingMisses > 0
      ? ((stats.embeddingHits / (stats.embeddingHits + stats.embeddingMisses)) * 100).toFixed(1)
      : 0;

  const searchHitRate =
    stats.searchHits + stats.searchMisses > 0
      ? ((stats.searchHits / (stats.searchHits + stats.searchMisses)) * 100).toFixed(1)
      : 0;

  return {
    embeddings: {
      entries: embeddingCache.size,
      hits: stats.embeddingHits,
      misses: stats.embeddingMisses,
      hitRate: `${embeddingHitRate}%`,
    },
    search: {
      entries: searchCache.size,
      hits: stats.searchHits,
      misses: stats.searchMisses,
      hitRate: `${searchHitRate}%`,
    },
  };
}

/**
 * Clear all caches
 */
function _clearCaches() {
  embeddingCache.clear();
  searchCache.clear();
  stats.embeddingHits = 0;
  stats.embeddingMisses = 0;
  stats.searchHits = 0;
  stats.searchMisses = 0;
}
