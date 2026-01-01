/**
 * Caching operations for embedding service
 * Integrates with embeddingCache for Redis-backed query caching
 */

import { embeddingCache } from '../embeddingCache.js';
import { validateText } from './validation.js';
import type MistralEmbeddingClient from '../MistralEmbeddingClient.js';

/**
 * Generate embedding for a search query with caching
 */
export async function generateQueryEmbeddingWithCache(
  client: MistralEmbeddingClient,
  query: string
): Promise<number[]> {
  validateText(query);

  // Check cache first
  const cachedEmbedding = await embeddingCache.getCachedEmbedding(query);
  if (cachedEmbedding) {
    return cachedEmbedding;
  }

  // Generate new embedding using client
  console.log(`[FastEmbedService] Generating embedding for "${query.substring(0, 50)}..."`);
  const startTime = Date.now();
  const embedding = await client.generateEmbedding(query);
  const duration = Date.now() - startTime;
  console.log(`[FastEmbedService] Embedding generated in ${duration}ms (${embedding.length} dims)`);

  // Cache the result
  await embeddingCache.cacheEmbedding(query, embedding);
  return embedding;
}
