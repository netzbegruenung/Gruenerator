/**
 * Cache Middleware
 * Redis-backed response caching for GET requests
 * Extracted from server.mjs for better modularity
 */

import type { Request, Response, NextFunction } from 'express';
import type { RedisClientType } from 'redis';

export interface CacheOptions {
  ttl?: number;
  keyPrefix?: string;
  excludePaths?: string[];
}

export interface CacheMiddlewareRequest extends Request {
  cacheSkipped?: boolean;
  cacheHit?: boolean;
}

const DEFAULT_TTL = 3600; // 1 hour
const DEFAULT_PREFIX = 'cache:';

/**
 * Create cache middleware with Redis backend
 */
export function createCacheMiddleware(
  redisClient: RedisClientType,
  options: CacheOptions = {}
): (req: CacheMiddlewareRequest, res: Response, next: NextFunction) => Promise<void> {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const keyPrefix = options.keyPrefix ?? DEFAULT_PREFIX;
  const excludePaths = options.excludePaths ?? ['/api/'];

  return async (req: CacheMiddlewareRequest, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      req.cacheSkipped = true;
      return next();
    }

    // Skip excluded paths
    for (const excludePath of excludePaths) {
      if (req.path.startsWith(excludePath)) {
        req.cacheSkipped = true;
        return next();
      }
    }

    const key = `${keyPrefix}${req.originalUrl}`;

    try {
      const cachedResponse = await redisClient.get(key);
      if (cachedResponse && typeof cachedResponse === 'string') {
        req.cacheHit = true;
        res.send(JSON.parse(cachedResponse));
        return;
      }

      // Store original send function
      const originalSend = res.send.bind(res);

      // Override send to cache the response
      res.send = function (body: unknown): Response {
        // Cache the response asynchronously
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        redisClient
          .set(key, bodyStr, { EX: ttl })
          .catch((err: Error) => console.error('[Cache] Error setting cache:', err));

        return originalSend(body);
      };

      next();
    } catch (err) {
      console.error('[Cache] Error:', err);
      next();
    }
  };
}

/**
 * Invalidate cache entries matching a pattern
 */
export async function invalidateCache(
  redisClient: RedisClientType,
  pattern: string,
  keyPrefix: string = DEFAULT_PREFIX
): Promise<number> {
  const fullPattern = `${keyPrefix}${pattern}`;
  const keys = await redisClient.keys(fullPattern);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
  return keys.length;
}

export default createCacheMiddleware;
