/**
 * Redis Client Connection
 * Creates and exports a configured Redis client with reconnection strategy
 */

import { createClient } from 'redis';
import type { RedisClient } from './types.js';
import * as dotenv from 'dotenv';

dotenv.config({ quiet: true });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('REDIS_URL ist nicht in der Umgebung konfiguriert!');
}

// Log the URL being used (mask password for security)
const maskedUrl = redisUrl?.replace(/:\/\/(.*:)?(.*)@/, '://<user>:<password>@') || 'no-url';
console.log(`Versuche Verbindung mit Redis: ${maskedUrl}`);

// createClient verwendet automatisch TLS, wenn die URL mit rediss:// beginnt
// IMPORTANT: Never return an Error from reconnectStrategy - this permanently closes the client.
// Instead, always return a delay to keep reconnecting indefinitely.
const client: RedisClient = createClient({
  url: redisUrl,
  socket: {
    // TCP keep-alive prevents idle connections from being dropped by Docker/NAT
    keepAlive: true,
    connectTimeout: 10000, // 10 second connection timeout
    reconnectStrategy: (retries: number) => {
      // Log reconnection attempts, but less frequently after initial failures
      if (retries <= 10 || retries % 10 === 0) {
        console.log(`Redis reconnection attempt ${retries}...`);
      }
      // Exponential backoff capped at 30 seconds to avoid overwhelming the server
      // while still allowing recovery from extended outages
      const delay = Math.min(retries * 500, 30000);
      return delay;
    }
  }
});

client.on('error', (err) => console.error('Redis Client Fehler:', err.message));
client.on('connect', () => console.log('Erfolgreich mit Redis verbunden'));
client.on('reconnecting', () => console.log('Verbinde neu mit Redis...'));
client.on('end', () => console.warn('Redis connection closed'));
client.on('ready', () => console.log('Redis client ready'));

// Connection promise for awaitable connection
let connectPromise: Promise<void> | null = null;

export function ensureConnected(): Promise<void> {
  if (client.isOpen) {
    return Promise.resolve();
  }
  if (!connectPromise) {
    connectPromise = client.connect().then(() => {}).catch(err => {
      console.error(`Redis connection failed (${maskedUrl}):`, err.message);
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

// Start connection immediately
ensureConnected().catch(() => {});

/**
 * Check Redis health status
 * Returns connection status and any error message
 */
export async function checkRedisHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    if (!client.isOpen) {
      await ensureConnected();
    }
    await client.ping();
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Exportiere den verbundenen Client für andere Module
export default client;

// Named export for modern imports
export { client as redisClient };
