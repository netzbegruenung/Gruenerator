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
const client: RedisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 5) {
        console.log('Maximale Anzahl an Redis-Wiederverbindungsversuchen erreicht. Stoppe Versuche.');
        return new Error('Zu viele Wiederverbindungsversuche.');
      }
      // Exponential backoff: wait 100ms, 200ms, 400ms, 800ms, 1600ms
      return Math.min(retries * 100, 2000);
    }
  }
});

client.on('error', (err) => console.error('Redis Client Fehler:', err.message));
client.on('connect', () => console.log('Erfolgreich mit Redis verbunden'));
client.on('reconnecting', (attempt) => console.log(`Verbinde neu mit Redis... Versuch ${attempt}`));

// Connection promise for awaitable connection
let connectPromise: Promise<void> | null = null;

export function ensureConnected(): Promise<void> {
  if (client.isOpen) {
    return Promise.resolve();
  }
  if (!connectPromise) {
    connectPromise = client.connect().catch(err => {
      console.error(`Redis connection failed (${maskedUrl}):`, err.message);
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

// Start connection immediately
ensureConnected().catch(() => {});

// Exportiere den verbundenen Client für andere Module
export default client;

// Named export for modern imports
export { client as redisClient };
