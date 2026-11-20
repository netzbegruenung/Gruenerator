/**
 * Consumer for the session request that an inline script in `index.html`
 * starts while the entry closure is still downloading (#5891). It stores
 * `{ url, startedAt, promise }` on `window.__gruenAuthStatus`.
 *
 * The first matching `GET …/auth/v2/get-session` made through the Better Auth
 * client takes the early response instead of hitting the network again, so the
 * body still goes through Better Auth's own parsing and our
 * `sessionUserToProfile` boundary. Every other case returns `null` and the
 * caller falls back to a normal request: URL mismatch, a rejected early fetch,
 * an answer older than `MAX_AGE_MS` (e.g. after a login), or a second call —
 * the entry is consumed exactly once.
 */
interface EarlyAuthStatus {
  url: string;
  startedAt: number;
  promise: Promise<Response>;
}

declare global {
  interface Window {
    __gruenAuthStatus?: EarlyAuthStatus | null;
  }
}

const MAX_AGE_MS = 30_000;

const toUrlString = (input: RequestInfo | URL): string | null => {
  try {
    if (typeof input === 'string') return new URL(input, window.location.origin).toString();
    if (input instanceof URL) return input.toString();
    return new URL(input.url, window.location.origin).toString();
  } catch {
    return null;
  }
};

export async function takeEarlyAuthStatus(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  if (typeof window === 'undefined') return null;
  const early = window.__gruenAuthStatus;
  if (!early) return null;

  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' || toUrlString(input) !== early.url) return null;

  // Consume before awaiting: a concurrent second caller must not share the body.
  window.__gruenAuthStatus = null;
  if (Date.now() - early.startedAt > MAX_AGE_MS) return null;

  try {
    return await early.promise;
  } catch {
    return null;
  }
}
