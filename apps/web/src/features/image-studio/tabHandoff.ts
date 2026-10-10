/**
 * Hands a request from the Studio composer to a page in a new browser tab. Router state
 * cannot cross tabs, so the payload waits in localStorage under a one-off id that travels in
 * the URL (`?handoff=<id>`) until the target page has taken it over.
 */
const PREFIX = 'studio-handoff:';
const PARAM = 'handoff';
const MAX_AGE_MS = 10 * 60 * 1000;

function sweep(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const at = Number(key.split(':')[2]);
    if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) localStorage.removeItem(key);
  }
}

/** `path` with the payload attached, or null when the browser refuses to store it. */
export function tabUrl(path: string, payload: unknown): string | null {
  try {
    sweep();
    const id = `${crypto.randomUUID()}:${Date.now()}`;
    localStorage.setItem(PREFIX + id, JSON.stringify(payload));
    return `${path}?${PARAM}=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

/** The payload a `tabUrl` carried, or null. Not consumed: call `dropTabPayload` once it is used. */
export function readTabPayload(search: string): unknown {
  try {
    const id = new URLSearchParams(search).get(PARAM);
    const raw = id ? localStorage.getItem(PREFIX + id) : null;
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function dropTabPayload(search: string): void {
  try {
    const id = new URLSearchParams(search).get(PARAM);
    if (id) localStorage.removeItem(PREFIX + id);
  } catch {
    // Storage is unavailable; there is nothing to drop.
  }
}
