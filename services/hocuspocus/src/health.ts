import express from 'express';

import { createLogger } from './logger.js';

import type { RedisLike } from './types.js';
import type PgPool from 'pg';

const log = createLogger('Health');

interface HealthDeps {
  pool: InstanceType<typeof PgPool.Pool>;
  redis: RedisLike;
}

export function startHealthServer(port: number, deps: HealthDeps): void {
  const { pool, redis } = deps;
  const app = express();

  // Cache the result to avoid running a DB query on every /health hit.
  // Acts as an implicit rate-limit against floods of requests.
  const HEALTH_CACHE_TTL_MS = 5_000;
  let cached: { at: number; statusCode: number; body: unknown } | null = null;
  let inFlight: Promise<{ statusCode: number; body: unknown }> | null = null;

  async function computeHealth(): Promise<{ statusCode: number; body: unknown }> {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    const pgStart = Date.now();
    try {
      await pool.query('SELECT 1');
      checks.postgres = { status: 'up', latencyMs: Date.now() - pgStart };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.postgres = { status: 'down', latencyMs: Date.now() - pgStart, error: msg };
    }

    checks.redis = redis.isReady ? { status: 'up' } : { status: 'down', error: 'Not connected' };

    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    const allUp = Object.values(checks).every((c) => c.status === 'up');
    const status = allUp ? 'healthy' : 'degraded';

    return {
      statusCode: allUp ? 200 : 503,
      body: {
        status,
        timestamp: new Date().toISOString(),
        service: 'gruenerator-hocuspocus',
        checks,
        pool: poolStats,
      },
    };
  }

  app.get('/health', async (_req, res) => {
    const now = Date.now();
    if (cached && now - cached.at < HEALTH_CACHE_TTL_MS) {
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    if (!inFlight) {
      inFlight = computeHealth().finally(() => {
        inFlight = null;
      });
    }

    try {
      const result = await inFlight;
      cached = { at: Date.now(), statusCode: result.statusCode, body: result.body };
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(503).json({ status: 'error', error: msg });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    log.info(`Health check server listening on port ${port}`);
  });
}
