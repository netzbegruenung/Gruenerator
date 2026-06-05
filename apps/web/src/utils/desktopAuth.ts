/**
 * Desktop (Tauri) authentication utilities
 *
 * Uses system browser + deep-link callback for OAuth, mirroring the mobile app.
 *
 * Flow:
 * 1. User picks a provider → system browser opens to /auth/login?source=...
 * 2. User authenticates with Keycloak (via Better Auth)
 * 3. Backend /auth/app-callback redirects to gruenerator://auth/callback?code=<jwt>
 * 4. Tauri receives the deep-link and emits the `deep-link-auth` event
 * 5. We exchange the one-shot code at /auth/v2/token-exchange-code for a Better
 *    Auth bearer session token, stored via the Tauri store plugin
 *
 * The bearer token is sent as `Authorization: Bearer <token>` by apiClient
 * (which calls getDesktopToken). There is no refresh token — the bearer session
 * slides server-side; an ended session yields 401 and the user re-authenticates.
 */

import { isDesktopApp } from './platform';

// Lazy import secure storage to avoid loading Tauri modules in web mode
// This prevents "Importing a module script failed" errors in browsers
const getSecureStorage = async () => {
  try {
    return await import('./desktopSecureStorage');
  } catch {
    return null;
  }
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const REDIRECT_URI = 'gruenerator://auth/callback';

/**
 * The system browser opened via shell.open() needs an absolute URL with a
 * scheme — a relative '/api/...' has none and is rejected by the shell scope,
 * so the click silently does nothing. In dev API_BASE_URL is the relative
 * '/api' (in-app fetches stay same-origin through the Vite proxy); prepend the
 * webview origin so the browser gets e.g. http://localhost:3000/api/auth/login.
 * In prod API_BASE_URL is already absolute and is returned unchanged.
 */
function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

export interface DesktopUser {
  id: string;
  email?: string;
  username?: string;
  display_name?: string;
  avatar_robot_id?: number;
  keycloak_id?: string | null;
  locale?: string;
  beta_features?: Record<string, boolean>;
  user_defaults?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

let deepLinkCleanup: (() => void) | null = null;

/**
 * Initialize desktop auth listener (call once on app start)
 */
export async function initDesktopAuth(
  onAuthSuccess: (user: DesktopUser, token: string) => void,
  onAuthError: (error: string) => void
): Promise<void> {
  if (!isDesktopApp()) return;

  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlisten = await listen<string>('deep-link-auth', async (event) => {
      const url = event.payload;
      console.log('[DesktopAuth] Received deep-link:', url);

      try {
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');

        if (error) {
          onAuthError(error);
          return;
        }

        if (!code) {
          onAuthError('No authentication code received');
          return;
        }

        const result = await exchangeCodeForToken(code);
        if (result.success && result.user && result.accessToken) {
          onAuthSuccess(result.user, result.accessToken);
        } else {
          onAuthError(result.error || 'Authentication failed');
        }
      } catch (err) {
        console.error('[DesktopAuth] Error handling callback:', err);
        onAuthError(err instanceof Error ? err.message : 'Unknown error');
      }
    });

    deepLinkCleanup = unlisten;
    console.log('[DesktopAuth] Deep-link listener initialized');

    // Check for existing auth on startup
    await restoreSession(onAuthSuccess);
  } catch (error) {
    console.error('[DesktopAuth] Failed to initialize:', error);
  }
}

/**
 * Restore session from secure storage on app start
 */
async function restoreSession(
  onAuthSuccess: (user: DesktopUser, token: string) => void
): Promise<void> {
  try {
    const storage = await getSecureStorage();
    if (!storage) return;

    const token = await storage.getAccessToken();
    const user = await storage.getStoredUser();
    if (!token || !user) return;

    // Drop the session only once it's definitively past expiry; otherwise
    // restore optimistically (server validates on the next request).
    const expiry = await storage.getTokenExpiry();
    if (expiry && Date.now() > expiry) {
      await storage.clearTokens();
      return;
    }

    console.log('[DesktopAuth] Session restored from secure storage');
    onAuthSuccess(user as DesktopUser, token);
  } catch (error) {
    console.error('[DesktopAuth] Error restoring session:', error);
  }
}

/**
 * Clean up desktop auth listener
 */
export function cleanupDesktopAuth(): void {
  if (deepLinkCleanup) {
    deepLinkCleanup();
    deepLinkCleanup = null;
  }
}

/**
 * Open system browser for OAuth login
 */
export async function openDesktopLogin(source: AuthSource = 'gruenerator-login'): Promise<void> {
  if (!isDesktopApp()) {
    window.location.href = `${API_BASE_URL}/auth/login?source=${source}`;
    return;
  }

  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    const authUrl = toAbsoluteUrl(
      `${API_BASE_URL}/auth/login?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`
    );
    console.log('[DesktopAuth] Opening browser:', authUrl);
    await open(authUrl);
  } catch (error) {
    console.error('[DesktopAuth] Failed to open browser:', error);
    throw error;
  }
}

/**
 * Exchange the one-shot login code for a Better Auth bearer session.
 *
 * Canonical native exchange (mobileTokenExchange plugin). Replaces the retired
 * /auth/mobile/consume-login-code route (which 404'd, so desktop login silently
 * never completed). Returns an opaque session token used as the Bearer; there
 * is no separate refresh token. Mirrors apps/mobile.
 */
async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  user?: DesktopUser;
  accessToken?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/v2/token-exchange-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      token?: string;
      user?: DesktopUser;
      expiresAt?: string;
      message?: string;
    };

    if (response.ok && data.token && data.user) {
      const storage = await getSecureStorage();
      if (storage) {
        await storage.saveSession(data.token, data.user, data.expiresAt);
      }

      return {
        success: true,
        user: data.user,
        accessToken: data.token,
      };
    }

    return {
      success: false,
      error: data.message || `Token-Tausch fehlgeschlagen (HTTP ${response.status})`,
    };
  } catch (error) {
    console.error('[DesktopAuth] Token exchange failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get the stored bearer session token, or null if absent / past hard expiry.
 * No client-side refresh: an expired/invalid token is rejected (401) and the
 * user re-authenticates.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const storage = await getSecureStorage();
  if (!storage) return null;

  const token = await storage.getAccessToken();
  if (!token) return null;

  const expiry = await storage.getTokenExpiry();
  if (expiry && Date.now() > expiry) return null;

  return token;
}

/**
 * Get the stored desktop bearer token (used by apiClient for `Authorization`).
 */
export async function getDesktopToken(): Promise<string | null> {
  return getValidAccessToken();
}
