/**
 * Bridge Code Store — Redis-backed single-use codes for mobile session bridging
 *
 * The docs-expo app authenticates via JWT but needs a web session for the
 * WebView (Hocuspocus requires cookie-based auth). The flow is:
 *   1. Native code POSTs JWT → gets an opaque bridge code (stored in Redis)
 *   2. WebView GETs the code → server consumes it atomically, creates a session
 *
 * Redis is required because the API runs in Node.js cluster mode — an
 * in-memory Map on one worker is invisible to other workers.
 */

import client from './client.js';

interface BridgeCodeData {
  userId: string;
  redirect: string;
}

const KEY_PREFIX = 'bridge:code:';
const TTL_SECONDS = 30;

/**
 * Store a bridge code in Redis with a 30-second TTL.
 */
export async function storeBridgeCode(code: string, data: BridgeCodeData): Promise<void> {
  await client.setEx(`${KEY_PREFIX}${code}`, TTL_SECONDS, JSON.stringify(data));
}

/**
 * Atomically retrieve and delete a bridge code from Redis.
 * Returns `null` if the code was not found, already consumed, or expired (TTL).
 */
export async function consumeBridgeCode(code: string): Promise<BridgeCodeData | null> {
  const key = `${KEY_PREFIX}${code}`;

  const results = await client.multi().get(key).del(key).exec();

  const raw = results[0] as unknown as string | null;
  if (!raw) return null;

  return JSON.parse(raw) as BridgeCodeData;
}
