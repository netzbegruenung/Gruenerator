import { createClient } from 'redis';

import { createLogger } from './logger.js';

import type { RedisLike } from './types.js';

const log = createLogger('Redis');

export function createRedisClient(): ReturnType<typeof createClient> & RedisLike {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    log.warn('REDIS_URL not configured');
  }

  const client = createClient({
    url: redisUrl,
    socket: {
      keepAlive: 5000,
      connectTimeout: 10000,
      reconnectStrategy: (retries: number) => {
        if (retries <= 10 || retries % 10 === 0) {
          log.info(`Redis reconnection attempt ${retries}...`);
        }
        return Math.min(retries * 500, 30000);
      },
    },
  });

  client.on('error', (err) => log.error(`Redis error: ${err.message}`));
  client.on('connect', () => log.info('Connected to Redis'));
  client.on('ready', () => log.info('Redis client ready'));

  return client as ReturnType<typeof createClient> & RedisLike;
}

export async function connectRedis(client: ReturnType<typeof createClient>): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
  }
}
