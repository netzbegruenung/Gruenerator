/**
 * Calls to the Hocuspocus internal API (`/internal/*`, token-gated). Throws on
 * any non-2xx so a write that did not land is never reported as done.
 */
import { createLogger } from '../../utils/logger.js';

const log = createLogger('hocuspocusInternal');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

export async function hocuspocusInternal(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<unknown> {
  if (!INTERNAL_TOKEN) throw new Error('HOCUSPOCUS_INTERNAL_TOKEN not configured');
  const res = await fetch(`${INTERNAL_URL}${path}`, {
    method,
    headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`internal ${method} ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Close the open collaboration connections of `rooms` — all of them, or only
 * `userId`'s — after an access change has been written. Hocuspocus checks
 * access once, when a connection is set up, so without this a removed or
 * downgraded user keeps the session they have open. Clients that still have
 * access reconnect and get their current rights.
 *
 * Unlike `hocuspocusInternal`, this never throws (like `bumpCardComments`): a
 * Hocuspocus outage must not fail the permission change. Call it with `void`
 * after the write.
 */
export async function closeCollabRooms(
  rooms: string[],
  userId: string | null = null
): Promise<void> {
  if (!INTERNAL_TOKEN || rooms.length === 0) return; // internal API disabled
  try {
    await hocuspocusInternal('POST', '/internal/rooms/close', { rooms, userId });
  } catch (err) {
    log.warn(
      `closing ${rooms.length} collab room(s) (first: ${rooms[0]}) failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
