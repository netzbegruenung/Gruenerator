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

  app.get('/health', async (_req, res) => {
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

    res.status(allUp ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      service: 'gruenerator-hocuspocus',
      checks,
      pool: poolStats,
    });
  });

  app.listen(port, '0.0.0.0', () => {
    log.info(`Health check server listening on port ${port}`);
  });
}
