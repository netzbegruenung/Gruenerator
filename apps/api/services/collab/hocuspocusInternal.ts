/**
 * Calls to the Hocuspocus internal API (`/internal/*`, token-gated). Throws on
 * any non-2xx so a write that did not land is never reported as done.
 */
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
