/**
 * Capacitor Mobile Authentication Utilities
 *
 * Uses In-App Browser + deep-link callback for OAuth flow.
 * Tokens are stored using Capacitor Preferences plugin.
 *
 * Flow:
 * 1. User clicks login → opens In-App Browser to /auth/login
 * 2. User authenticates with Keycloak
 * 3. Callback redirects to gruenerator://auth/callback?code=<jwt>
 * 4. Capacitor App plugin receives deep-link, emits event
 * 5. We exchange the code for access + refresh tokens
 * 6. Tokens stored in Capacitor Preferences
 */

import { isCapacitorApp } from './platform';

const getSecureStorage = async () => {
  try {
    return await import('./capacitorSecureStorage');
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

export interface CapacitorUser {
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
  user?: CapacitorUser;
  error?: string;
  message?: string;
}

type AppUrlOpenListener = { remove: () => Promise<void> };

let appUrlCleanup: AppUrlOpenListener | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize Capacitor auth listener (call once on app start)
 */
export async function initCapacitorAuth(
  onAuthSuccess: (user: CapacitorUser, token: string) => void,
  onAuthError: (error: string) => void
): Promise<void> {
  if (!isCapacitorApp()) return;

  try {
    const { App } = await import('@capacitor/app');

    // Listen for deep links
    const listener = await App.addListener('appUrlOpen', async (event) => {
      const url = event.url;
      console.log('[CapacitorAuth] Received deep-link:', url);

      // Check if this is our auth callback
      if (!url.startsWith('gruenerator://auth/callback')) {
        return;
      }

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

        // Close the in-app browser
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {
          // Browser might already be closed
        }

        const result = await exchangeCodeForToken(code);
        if (result.success && result.user && result.accessToken) {
          scheduleTokenRefresh();
          onAuthSuccess(result.user, result.accessToken);
        } else {
          onAuthError(result.error || 'Authentication failed');
        }
      } catch (err) {
        console.error('[CapacitorAuth] Error handling callback:', err);
        onAuthError(err instanceof Error ? err.message : 'Unknown error');
      }
    });

    appUrlCleanup = listener;
    console.log('[CapacitorAuth] Deep-link listener initialized');

    // Check for existing auth on startup
    await restoreSession(onAuthSuccess);
  } catch (error) {
    console.error('[CapacitorAuth] Failed to initialize:', error);
  }
}

/**
 * Restore session from secure storage on app start
 */
async function restoreSession(
  onAuthSuccess: (user: CapacitorUser, token: string) => void
): Promise<void> {
  try {
    const storage = await getSecureStorage();
    if (!storage) return;

    const hasAuth = await storage.hasStoredAuth();
    if (!hasAuth) {
      console.log('[CapacitorAuth] No stored auth found');
      return;
    }

    let accessToken = await storage.getAccessToken();
    const user = await storage.getStoredUser();

    if (!user) {
      console.log('[CapacitorAuth] No stored user found');
      await storage.clearTokens();
      return;
    }

    // Check if token is expired and refresh if needed
    if (await storage.isTokenExpired()) {
      console.log('[CapacitorAuth] Access token expired, refreshing...');
      const refreshResult = await refreshAccessToken();
      if (!refreshResult.success) {
        console.log('[CapacitorAuth] Failed to refresh token, clearing auth');
        await storage.clearTokens();
        return;
      }
      accessToken = refreshResult.accessToken || null;
    }

    if (accessToken && user) {
      console.log('[CapacitorAuth] Session restored from secure storage');
      scheduleTokenRefresh();
      onAuthSuccess(user as CapacitorUser, accessToken);
    }
  } catch (error) {
    console.error('[CapacitorAuth] Error restoring session:', error);
  }
}

/**
 * Clean up Capacitor auth listener
 */
export function cleanupCapacitorAuth(): void {
  if (appUrlCleanup) {
    appUrlCleanup.remove();
    appUrlCleanup = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Open In-App Browser for OAuth login
 */
export async function openCapacitorLogin(source: AuthSource = 'gruenerator-login'): Promise<void> {
  if (!isCapacitorApp()) {
    window.location.href = `${API_BASE_URL}/auth/login?source=${source}`;
    return;
  }

  try {
    const { Browser } = await import('@capacitor/browser');
    const authUrl = `${API_BASE_URL}/auth/login?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;
    console.log('[CapacitorAuth] Opening browser:', authUrl);

    await Browser.open({
      url: authUrl,
      presentationStyle: 'popover',
      toolbarColor: '#008939', // Green party color
    });
  } catch (error) {
    console.error('[CapacitorAuth] Failed to open browser:', error);
    throw error;
  }
}

/**
 * Exchange login code for JWT tokens
 */
async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  user?: CapacitorUser;
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
    console.error('[CapacitorAuth] Token exchange failed:', error);
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
      await storage.updateAccessToken(data.access_token, data.expires_in);

      if (data.user) {
        await storage.updateStoredUser(data.user);
      }

      console.log('[CapacitorAuth] Access token refreshed');
      return { success: true, accessToken: data.access_token };
    }

    if (
      data.error === 'token_expired' ||
      data.error === 'token_revoked' ||
      data.error === 'invalid_refresh_token'
    ) {
      await storage.clearTokens();
    }

    return { success: false, error: data.error || data.message || 'Failed to refresh token' };
  } catch (error) {
    console.error('[CapacitorAuth] Token refresh failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Schedule automatic token refresh before expiry
 */
function scheduleTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Refresh 2 minutes before expiry (tokens last 15 min, so refresh at ~13 min)
  const refreshInterval = 13 * 60 * 1000;

  refreshTimer = setTimeout(async () => {
    console.log('[CapacitorAuth] Auto-refreshing token...');
    const result = await refreshAccessToken();
    if (result.success) {
      scheduleTokenRefresh();
    } else {
      console.error('[CapacitorAuth] Auto-refresh failed:', result.error);
    }
  }, refreshInterval);

  console.log('[CapacitorAuth] Token refresh scheduled');
}

/**
 * Get the current access token (refreshing if needed)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const storage = await getSecureStorage();
  if (!storage) return null;

  const expired = await storage.isTokenExpired();

  if (expired) {
    console.log('[CapacitorAuth] Token expired, refreshing...');
    const result = await refreshAccessToken();
    if (result.success && result.accessToken) {
      return result.accessToken;
    }
    return null;
  }

  return storage.getAccessToken();
}

/**
 * Get stored Capacitor token
 */
export async function getCapacitorToken(): Promise<string | null> {
  return getValidAccessToken();
}

/**
 * Clear Capacitor token and logout
 */
export async function clearCapacitorToken(): Promise<void> {
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
    console.error('[CapacitorAuth] Error revoking refresh token:', error);
  }

  if (storage) {
    await storage.clearTokens();
  }
}

/**
 * Check if user has stored Capacitor auth
 */
export async function hasCapacitorAuth(): Promise<boolean> {
  const storage = await getSecureStorage();
  if (!storage) return false;
  return storage.hasStoredAuth();
}

/**
 * Make an authenticated API request
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
export async function getCurrentCapacitorUser(): Promise<CapacitorUser | null> {
  const storage = await getSecureStorage();
  if (!storage) return null;
  return storage.getStoredUser() as Promise<CapacitorUser | null>;
}
