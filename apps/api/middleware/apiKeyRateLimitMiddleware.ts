import { createLogger } from '../utils/logger.js';
import { redisClient } from '../utils/redis/index.js';

import type { Request, Response, NextFunction } from 'express';

const log = createLogger('apiKeyRateLimit');

const DEFAULT_PER_MINUTE = 60;

export type RateLimitVerdict =
  | { ok: true; limit: number; remaining: number }
  | { ok: false; limit: number; retryAfterSeconds: number };

/**
 * Ein Zähler pro Schlüssel und Minute — geteilt zwischen der REST-Middleware
 * und dem MCP-Endpunkt, damit ein Schlüssel sein Kontingent nicht zweimal
 * bekommt, nur weil er zwei Türen benutzt. Der MCP-Endpunkt kann die Middleware
 * nicht nehmen: er antwortet JSON-RPC, nicht REST.
 */
export async function consumeApiKeyRateLimit(
  apiKeyId: string,
  resource: string,
  limit: number
): Promise<RateLimitVerdict> {
  if (limit <= 0) return { ok: true, limit, remaining: Number.MAX_SAFE_INTEGER };

  const bucket = Math.floor(Date.now() / 60_000);
  const key = `apikey_rl:${apiKeyId}:${resource}:${bucket}`;

  try {
    // `isReady` vor dem await: ein nicht verbundener Client lässt `incr` hängen,
    // statt abzulehnen — das Zeitlimit fiele dann auf die Anfrage zurück.
    if (!redisClient.isReady) {
      log.warn('[apiKeyRateLimit] Redis nicht bereit, Anfrage wird durchgelassen');
      return { ok: true, limit, remaining: limit };
    }

    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 65);
    if (count > limit) {
      return { ok: false, limit, retryAfterSeconds: 60 - (Math.floor(Date.now() / 1000) % 60) };
    }
    return { ok: true, limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    // Fail-open: Redis hiccup shouldn't take down the API.
    log.warn('[apiKeyRateLimit] Redis error, allowing request:', err);
    return { ok: true, limit, remaining: limit };
  }
}

export function apiKeyRateLimit(resource: string, fallbackPerMinute = DEFAULT_PER_MINUTE) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = req.apiKey;
    if (!ctx) {
      // Should never happen — requireApiKey runs first.
      res.status(401).json({ error: 'API key context missing' });
      return;
    }

    const verdict = await consumeApiKeyRateLimit(
      ctx.id,
      resource,
      ctx.rateLimitPerMinute ?? fallbackPerMinute
    );

    if (!verdict.ok) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        limit: verdict.limit,
        window: '1m',
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(verdict.limit));
    res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    next();
  };
}

export { DEFAULT_PER_MINUTE as API_KEY_DEFAULT_RATE_LIMIT };
