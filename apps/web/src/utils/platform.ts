/**
 * Platform detection utilities for conditional rendering
 * between web and desktop (Tauri) environments.
 */

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isNativeApp = (): boolean => {
  return isDesktopApp();
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};

export type AppContext = 'web' | 'desktop';

export const getAppContext = (): AppContext => {
  if (isDesktopApp()) return 'desktop';
  return 'web';
};

export type DesktopOS = 'macos' | 'windows' | 'linux' | 'unknown';

/**
 * Detects the host OS for the desktop (Tauri) shell so the title bar can follow
 * platform conventions: native traffic lights on macOS, custom caption controls
 * on Windows/Linux. Synchronous (UA-based) so it is safe to use during render.
 */
export const getDesktopOS = (): DesktopOS => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
};

export const isMacDesktop = (): boolean => isDesktopApp() && getDesktopOS() === 'macos';

/**
 * Resolve a (possibly root-relative) API/media URL to one usable by plain
 * `<img>` / `<video>` tags in the desktop webview.
 *
 * On web, a path like `/api/share/x/thumbnail` resolves same-origin to the API
 * host and just works. In the Tauri webview the origin is `tauri://localhost`,
 * so the same path points at the bundle (404 → broken image) instead of the
 * backend. This prefixes the configured API origin (from `VITE_API_BASE_URL`,
 * e.g. `https://gruenerator.eu/api` → origin `https://gruenerator.eu`) only on
 * desktop. Absolute (`http(s):`), `data:` and `blob:` URLs pass through
 * unchanged; on web it is a no-op.
 *
 * Use only for endpoints that work without an Authorization header (public or
 * cookie-less GETs) — `<img>`/`<video>` cannot attach the bearer token.
 */
export function resolveApiAssetUrl(url: string): string;
export function resolveApiAssetUrl(url: string | undefined): string | undefined;
export function resolveApiAssetUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!isDesktopApp()) return url;
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!apiBase || !/^https?:/i.test(apiBase)) return url;
  try {
    const apiOrigin = new URL(apiBase).origin;
    return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
  } catch {
    return url;
  }
}

/**
 * The absolute origin of the configured API (`https://gruenerator.eu`), or null
 * if it can't be resolved. Shared by the helpers below.
 */
function apiOriginOrNull(): string | null {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!apiBase || !/^https?:/i.test(apiBase)) return null;
  try {
    return new URL(apiBase).origin;
  } catch {
    return null;
  }
}

/**
 * The public app origin for user-facing share / copy / QR-code URLs.
 *
 * On web this is `window.location.origin`. In the desktop (Tauri) shell the
 * page origin is `tauri://localhost`, which is useless in a shared link — use
 * the configured public origin (`https://gruenerator.eu`) instead.
 */
export function getPublicAppOrigin(): string {
  if (isDesktopApp()) {
    return apiOriginOrNull() ?? 'https://gruenerator.eu';
  }
  return typeof window !== 'undefined' ? window.location.origin : 'https://gruenerator.eu';
}

/**
 * Derive the Hocuspocus collaboration WebSocket URL (`wss://<host>/ws`).
 *
 * Deriving from `window.location` breaks in the desktop webview (origin
 * `tauri://localhost` → falls back to `ws://localhost:1240`). Derive the host
 * from the absolute API base instead; web is unchanged (API host == page host).
 */
export function deriveCollabWsUrl(): string {
  const origin = apiOriginOrNull();
  if (origin) return `${origin.replace(/^http/, 'ws')}/ws`;
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : 'ws://localhost:1240';
}
