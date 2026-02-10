import 'dotenv/config';

import { AuthService } from './auth.js';
import { createPool, wrapPoolAsQueryFn } from './db.js';
import { startHealthServer } from './health.js';
import { createLogger } from './logger.js';
import { PostgresPersistence } from './persistence.js';
import { createRedisClient, connectRedis } from './redis.js';
import { createHocuspocusServer } from './server.js';

const log = createLogger('Main');

const HOCUSPOCUS_PORT = parseInt(process.env.HOCUSPOCUS_PORT || '1240', 10);
const HOCUSPOCUS_HOST = process.env.HOCUSPOCUS_HOST || '0.0.0.0';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '1241', 10);

async function main(): Promise<void> {
  log.info('Starting Hocuspocus service...');

  // 1. Create database pool
  const pool = createPool();
  const dbQuery = wrapPoolAsQueryFn(pool);
  log.info('PostgreSQL pool created');

  // 2. Create and connect Redis client
  const redis = createRedisClient();
  await connectRedis(redis);
  log.info('Redis client connected');

  // 3. Instantiate services with injected dependencies
  const persistence = new PostgresPersistence(dbQuery);
  const auth = new AuthService({
    db: dbQuery,
    redis,
    sessionSecret: process.env.SESSION_SECRET || 'fallback-secret-please-change',
  });

  // 4. Start Hocuspocus WebSocket server
  const server = createHocuspocusServer({
    port: HOCUSPOCUS_PORT,
    host: HOCUSPOCUS_HOST,
    persistence,
    auth,
  });
  server.listen();
  log.info(`Hocuspocus WebSocket server started on ${HOCUSPOCUS_HOST}:${HOCUSPOCUS_PORT}`);

  // 5. Start health check HTTP server
  startHealthServer(HEALTH_PORT);

  // 6. Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down gracefully...');
    await server.destroy();
    await pool.end();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
