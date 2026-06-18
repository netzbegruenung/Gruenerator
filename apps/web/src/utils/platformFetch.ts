import { getDesktopToken } from './desktopAuth';
import { isDesktopApp, resolveApiAssetUrl } from './platform';

/**
 * `fetch` that works in both the web app and the desktop (Tauri) shell.
 *
 * Many features call `fetch('/api/...')` directly (streaming endpoints,
 * EventSource-style readers, beacons) instead of going through the axios
 * `apiClient`. On web that's fine — the relative URL resolves same-origin and
 * the session cookie authenticates. In the desktop webview the origin is
 * `tauri://localhost`, so the relative URL 404s to the SPA bundle and there is
 * no cookie cross-origin. This wrapper, on desktop only:
 *   - resolves a root-relative `/api/...` URL to the absolute API origin, and
 *   - attaches the stored bearer token.
 * On web it forwards unchanged (caller keeps its own `credentials`).
 */
export async function platformFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isDesktopApp()) {
    const headers = new Headers(init?.headers);
    const token = await getDesktopToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Bearer auth is cross-origin; don't also send (non-existent) cookies.
    return fetch(resolveApiAssetUrl(input), { ...init, headers, credentials: 'omit' });
  }
  return fetch(input, init);
}
