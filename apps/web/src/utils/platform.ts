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

/**
 * True when the page runs inside a host that supplies its own chrome — today
 * the mobile app's in-app WebView, which opens us with `?embedded=1`.
 *
 * Read ONCE at module import, deliberately. The flag has to survive
 * client-side navigation, and React Router drops the query string as soon as
 * the app navigates; re-reading `location.search` later would silently turn
 * the chrome back on mid-session. A module constant is also available to code
 * that runs before React mounts.
 *
 * Everything this switches off is a way to navigate *out* of the embedded
 * page: app chrome, global overlays, and the hard redirect to /login. The
 * matching server-side allowlist of embeddable paths lives in
 * `apps/api/plugins/webViewHandoffRedirect.ts`.
 */
const EMBEDDED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('embedded') === '1';

export const isEmbedded = (): boolean => EMBEDDED;

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

export type VisitorDevice = 'ios' | 'android' | null;

/**
 * Best-effort UA detection of the visitor's mobile device for the /apps page.
 * iPadOS reports a Mac UA but exposes touch points, hence the maxTouchPoints check.
 * Desktop visitors resolve to null — the page offers them a QR code instead.
 */
export const getVisitorDevice = (): VisitorDevice => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/mac/i.test(ua) && navigator.maxTouchPoints > 1))
    return 'ios';
  return null;
};

const SHARE_DOWNLOAD_RE = /^\/api\/share\/([^/?#]+)\/download$/;
const THUMBS_RE = /^\/api\/thumbs\//;

/**
 * A canvas thumbnail URL is the full-resolution render (a multi-MB PNG at
 * pixelRatio 2) — that is what the mobile viewer downloads into the gallery.
 * Card-sized `<img>`s ask for a resized variant instead, served webp from the
 * server's disk cache. Other URLs pass through unchanged.
 *
 * Two URL shapes because the field is mid-migration: `/api/thumbs/...` (signed,
 * takes `&w=&fmt=`) is what the API emits now; `/api/share/<token>/download` is
 * still what the column stores and what older responses carried.
 */
export function shareThumbnailPreviewUrl(url: string, width?: 200 | 400 | 800): string;
export function shareThumbnailPreviewUrl(
  url: string | undefined,
  width?: 200 | 400 | 800
): string | undefined;
export function shareThumbnailPreviewUrl(
  url: string | undefined,
  width: 200 | 400 | 800 = 400
): string | undefined {
  if (!url) return url;
  if (THUMBS_RE.test(url)) {
    // set, not append: the API already mints these with a default w/fmt, and a
    // second pair would make `req.query.w` an array server-side — which parses
    // as NaN and answers 400, i.e. a broken tile.
    const [path, query] = url.split('?');
    const params = new URLSearchParams(query);
    params.set('w', String(width));
    params.set('fmt', 'webp');
    return `${path}?${params.toString()}`;
  }
  const match = SHARE_DOWNLOAD_RE.exec(url);
  return match ? `/api/share/${match[1]}/preview?w=${width}&fmt=webp` : url;
}

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
