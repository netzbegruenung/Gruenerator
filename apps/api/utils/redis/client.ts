/**
 * Redis Client Connection
 * Creates and exports a configured Redis client with reconnection strategy
 */

import * as dotenv from 'dotenv';
import { createClient } from 'redis';

import { env } from '../../config/env.js';
import { toUserFacingMessage } from '../errors/index.js';

import type { RedisClient } from './types.js';

dotenv.config({ quiet: true });

// Vitest forwards every console line to its main process over RPC. CI starts no
// Redis service, so this client reconnects forever and each attempt logs —
// ~150 lines per `apps/api` run, on a timer, long after the test file that
// pulled the module in has finished. A line still in flight when a worker is
// torn down aborts the whole run with
//   EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending
// and every test still reported as passing. Under test nothing reads these
// lines, so nothing is lost by dropping them; outside test the output is
// unchanged.
const quiet = process.env.VITEST === 'true';
const logInfo = (message: string): void => {
  if (!quiet) console.log(message);
};
const logWarn = (message: string): void => {
  if (!quiet) console.warn(message);
};
const logError = (message: string): void => {
  if (!quiet) console.error(message);
};

const redisUrl = env.REDIS_URL;
if (!redisUrl) {
  logError('REDIS_URL ist nicht in der Umgebung konfiguriert!');
}

// Log the URL being used (mask password for security)
const maskedUrl = redisUrl?.replace(/:\/\/(.*:)?(.*)@/, '://<user>:<password>@') || 'no-url';
logInfo(`Versuche Verbindung mit Redis: ${maskedUrl}`);

// createClient verwendet automatisch TLS, wenn die URL mit rediss:// beginnt
// IMPORTANT: Never return an Error from reconnectStrategy - this permanently closes the client.
// Instead, always return a delay to keep reconnecting indefinitely.
const createClientConfig: Parameters<typeof createClient>[0] = {
  socket: {
    // TCP keep-alive prevents idle connections from being dropped by Docker/NAT
    keepAlive: true,
    connectTimeout: 10000, // 10 second connection timeout
    reconnectStrategy: (retries: number) => {
      // Log reconnection attempts, but less frequently after initial failures
      if (retries <= 10 || retries % 10 === 0) {
        logInfo(`Redis reconnection attempt ${retries}...`);
      }
      // Exponential backoff capped at 30 seconds to avoid overwhelming the server
      // while still allowing recovery from extended outages
      const delay = Math.min(retries * 500, 30000);
      return delay;
    },
  },
};

if (redisUrl != null) {
  createClientConfig.url = redisUrl;
}

const client = createClient(createClientConfig) as RedisClient;

client.on('error', (err: unknown) =>
  logError(`Redis Client Fehler: ${err instanceof Error ? err.message : String(err)}`)
);
client.on('connect', () => logInfo('Erfolgreich mit Redis verbunden'));
client.on('reconnecting', () => logInfo('Verbinde neu mit Redis...'));
client.on('end', () => logWarn('Redis connection closed'));
client.on('ready', () => logInfo('Redis client ready'));

// Connection promise for awaitable connection
let connectPromise: Promise<void> | null = null;

export function ensureConnected(): Promise<void> {
  if (client.isOpen) {
    return Promise.resolve();
  }
  if (!connectPromise) {
    connectPromise = client
      .connect()
      .then(() => {})
      .catch((err: unknown) => {
        logError(
          `Redis connection failed (${maskedUrl}): ${err instanceof Error ? err.message : String(err)}`
        );
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
      error: toUserFacingMessage(error),
    };
  }
}

// Exportiere den verbundenen Client für andere Module
export default client;

// Named export for modern imports
export { client as redisClient };
