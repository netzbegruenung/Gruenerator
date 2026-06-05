import { createLogger } from '../utils/logger.js';
import { redisClient } from '../utils/redis/index.js';

import type { Request, Response, NextFunction } from 'express';

const log = createLogger('apiKeyRateLimit');

const DEFAULT_PER_MINUTE = 60;

export function apiKeyRateLimit(resource: string, fallbackPerMinute = DEFAULT_PER_MINUTE) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = req.apiKey;
    if (!ctx) {
      // Should never happen — requireApiKey runs first.
      res.status(401).json({ error: 'API key context missing' });
      return;
    }

    const limit = ctx.rateLimitPerMinute ?? fallbackPerMinute;
    if (limit <= 0) {
      next();
      return;
    }

    const bucket = Math.floor(Date.now() / 60_000);
    const key = `apikey_rl:${ctx.id}:${resource}:${bucket}`;

    try {
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.expire(key, 65);
      if (count > limit) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          limit,
          window: '1m',
          retryAfterSeconds: 60 - (Math.floor(Date.now() / 1000) % 60),
        });
        return;
      }
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    } catch (err) {
      // Fail-open: Redis hiccup shouldn't take down the API.
      log.warn('[apiKeyRateLimit] Redis error, allowing request:', err);
    }

    next();
  };
}
