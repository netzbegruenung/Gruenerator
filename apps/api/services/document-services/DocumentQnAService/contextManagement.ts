/**
 * Context management operations
 * Handles cache key generation and cache operations
 */

import crypto from 'crypto';

import { createLogger } from '../../../utils/logger.js';

import type { AgentType } from './types.js';

const log = createLogger('contextManagement');

/**
 * Generate cache key for document extraction
 */
export function generateCacheKey(documentIds: string[], agent: AgentType, message: string): string {
  const sortedIds = [...documentIds].sort();
  const messageHash = crypto.createHash('md5').update(message.substring(0, 100)).digest('hex');
  const idsHash = crypto.createHash('md5').update(sortedIds.join(':')).digest('hex');

  return `qna:${agent}:${idsHash}:${messageHash}`;
}

/**
 * Get cached knowledge from Redis
 */
export async function getCachedKnowledge(
  redis: { get: (key: string) => Promise<string | null> },
  cacheKey: string
): Promise<string | null> {
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const knowledge: string = JSON.parse(cached) as string;
      return knowledge;
    }
    return null;
  } catch (error) {
    log.error('[DocumentQnAService] Error getting cached knowledge:', { error });
    return null;
  }
}

/**
 * Cache knowledge in Redis with TTL
 */
export async function cacheKnowledge(
  redis: { setEx: (key: string, ttl: number, value: string) => Promise<unknown> },
  cacheKey: string,
  knowledge: string,
  ttlSeconds: number = 3600
): Promise<void> {
  try {
    await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(knowledge));
  } catch (error) {
    log.error('[DocumentQnAService] Error caching knowledge:', { error });
  }
}
