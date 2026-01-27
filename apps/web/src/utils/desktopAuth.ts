/**
 * Desktop (Tauri) authentication utilities
 *
 * Uses system browser + deep-link callback for OAuth flow.
 * Tokens are stored securely using Tauri's store plugin.
 *
 * Flow:
 * 1. User clicks login → opens system browser to /auth/login
 * 2. User authenticates with Keycloak
 * 3. Callback redirects to gruenerator://auth/callback?code=<jwt>
 * 4. Tauri receives deep-link, emits event
 * 5. We exchange the code for access + refresh tokens
 * 6. Tokens stored in secure storage
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const REDIRECT_URI = 'gruenerator://auth/callback';

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
  igel_modus?: boolean;
  locale?: string;
  beta_features?: Record<string, boolean>;
  user_defaults?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

interface TokenResponse {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: DesktopUser;
  error?: string;
  message?: string;
}

let deepLinkCleanup: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
          // Start auto-refresh timer
          scheduleTokenRefresh();
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

    const hasAuth = await storage.hasStoredAuth();
    if (!hasAuth) {
      console.log('[DesktopAuth] No stored auth found');
      return;
    }

    // Try to get current access token
    let accessToken = await storage.getAccessToken();
    const user = await storage.getStoredUser();

    if (!user) {
      console.log('[DesktopAuth] No stored user found');
      await storage.clearTokens();
      return;
    }

    // Check if token is expired and refresh if needed
    if (await storage.isTokenExpired()) {
      console.log('[DesktopAuth] Access token expired, refreshing...');
      const refreshResult = await refreshAccessToken();
      if (!refreshResult.success) {
        console.log('[DesktopAuth] Failed to refresh token, clearing auth');
        await storage.clearTokens();
        return;
      }
      accessToken = refreshResult.accessToken || null;
    }

    if (accessToken && user) {
      console.log('[DesktopAuth] Session restored from secure storage');
      scheduleTokenRefresh();
      onAuthSuccess(user as DesktopUser, accessToken);
    }
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
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
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
    const authUrl = `${API_BASE_URL}/auth/login?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;
    console.log('[DesktopAuth] Opening browser:', authUrl);
    await open(authUrl);
  } catch (error) {
    console.error('[DesktopAuth] Failed to open browser:', error);
    throw error;
  }
}

/**
 * Exchange login code for JWT tokens
 */
async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  user?: DesktopUser;
  accessToken?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/mobile/consume-login-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const data = (await response.json()) as TokenResponse;

    if (response.ok && data.success && data.access_token && data.refresh_token && data.user) {
      // Save tokens to secure storage
      const storage = await getSecureStorage();
      if (storage) {
        await storage.saveTokens(data.access_token, data.refresh_token, data.user, data.expires_in);
      }

      return {
        success: true,
        user: data.user,
        accessToken: data.access_token,
      };
    }

    return {
      success: false,
      error: data.error || data.message || 'Invalid response from server',
    };
  } catch (error) {
    console.error('[DesktopAuth] Token exchange failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  try {
    const storage = await getSecureStorage();
    if (!storage) {
      return { success: false, error: 'Storage not available' };
    }

    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    const response = await fetch(`${API_BASE_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = (await response.json()) as TokenResponse;

    if (response.ok && data.success && data.access_token) {
      // Update access token in secure storage
      await storage.updateAccessToken(data.access_token, data.expires_in);

      // Update user if returned
      if (data.user) {
        await storage.updateStoredUser(data.user);
      }

      console.log('[DesktopAuth] Access token refreshed');
      return { success: true, accessToken: data.access_token };
    }

    // If refresh failed due to expired/invalid token, clear everything
    if (
      data.error === 'token_expired' ||
      data.error === 'token_revoked' ||
      data.error === 'invalid_refresh_token'
    ) {
      await storage.clearTokens();
    }

    return { success: false, error: data.error || data.message || 'Failed to refresh token' };
  } catch (error) {
    console.error('[DesktopAuth] Token refresh failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Schedule automatic token refresh before expiry
 */
function scheduleTokenRefresh(): void {
  // Clear any existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Refresh 2 minutes before expiry (tokens last 15 min, so refresh at ~13 min)
  const refreshInterval = 13 * 60 * 1000; // 13 minutes

  refreshTimer = setTimeout(async () => {
    console.log('[DesktopAuth] Auto-refreshing token...');
    const result = await refreshAccessToken();
    if (result.success) {
      // Schedule next refresh
      scheduleTokenRefresh();
    } else {
      console.error('[DesktopAuth] Auto-refresh failed:', result.error);
      // Don't schedule another refresh - user will need to re-login
    }
  }, refreshInterval);

  console.log('[DesktopAuth] Token refresh scheduled');
}

/**
 * Get the current access token (refreshing if needed)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const storage = await getSecureStorage();
  if (!storage) return null;

  const expired = await storage.isTokenExpired();

  if (expired) {
    console.log('[DesktopAuth] Token expired, refreshing...');
    const result = await refreshAccessToken();
    if (result.success && result.accessToken) {
      return result.accessToken;
    }
    return null;
  }

  return storage.getAccessToken();
}

/**
 * Get stored desktop token (legacy compatibility + new tokens)
 */
export async function getDesktopToken(): Promise<string | null> {
  return getValidAccessToken();
}

/**
 * Clear desktop token and logout
 */
export async function clearDesktopToken(): Promise<void> {
  // Stop auto-refresh
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const storage = await getSecureStorage();

  // Revoke refresh token on server
  try {
    const refreshToken = storage ? await storage.getRefreshToken() : null;
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/auth/mobile/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }
  } catch (error) {
    console.error('[DesktopAuth] Error revoking refresh token:', error);
  }

  // Clear local storage
  if (storage) {
    await storage.clearTokens();
  }
}

/**
 * Check if user has stored desktop auth
 */
export async function hasDesktopAuth(): Promise<boolean> {
  const storage = await getSecureStorage();
  if (!storage) return false;
  return storage.hasStoredAuth();
}

/**
 * Make an authenticated API request
 * Automatically includes Bearer token and handles token refresh
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getValidAccessToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If we get 401, try refreshing token once
  if (response.status === 401) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.success && refreshResult.accessToken) {
      headers.set('Authorization', `Bearer ${refreshResult.accessToken}`);
      return fetch(url, { ...options, headers });
    }
  }

  return response;
}

/**
 * Get the current authenticated user from storage
 */
export async function getCurrentDesktopUser(): Promise<DesktopUser | null> {
  const storage = await getSecureStorage();
  if (!storage) return null;
  return storage.getStoredUser() as Promise<DesktopUser | null>;
}
