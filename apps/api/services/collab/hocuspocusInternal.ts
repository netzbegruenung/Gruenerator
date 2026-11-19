/**
 * Calls to the Hocuspocus internal API (`/internal/*`, token-gated). Throws on
 * any non-2xx so a write that did not land is never reported as done.
 */
import { createLogger } from '../../utils/logger.js';

const log = createLogger('hocuspocusInternal');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

async function send(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  nullOn404: boolean
): Promise<unknown> {
  if (!INTERNAL_TOKEN) throw new Error('HOCUSPOCUS_INTERNAL_TOKEN not configured');
  const res = await fetch(`${INTERNAL_URL}${path}`, {
    method,
    headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // Only the route's own JSON 404 counts: Express answers an unmounted /internal (no token on
  // the Hocuspocus side) with an HTML 404, which must stay an error, not "no state".
  if (nullOn404 && res.status === 404) {
    const notFound = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof notFound?.error === 'string') return null;
    throw new Error(`internal ${method} ${path} returned 404 without a JSON error`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`internal ${method} ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function hocuspocusInternal(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<unknown> {
  return send(method, path, body, false);
}

/** Like `hocuspocusInternal`, but a 404 answers null instead of throwing. */
export async function hocuspocusInternalOrNull(
  method: 'GET',
  path: string
): Promise<unknown | null> {
  return send(method, path, undefined, true);
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
