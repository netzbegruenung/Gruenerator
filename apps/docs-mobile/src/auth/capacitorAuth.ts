/**
 * Capacitor Mobile Authentication for Docs
 *
 * Deep-link OAuth flow:
 * 1. User clicks login → In-App Browser opens /auth/login
 * 2. User authenticates with Keycloak
 * 3. Callback redirects to gruenerator-docs://auth/callback?code=<jwt>
 * 4. Capacitor App plugin intercepts deep-link
 * 5. Code exchanged for access + refresh tokens
 * 6. Tokens stored in Capacitor Preferences
 */

import * as storage from './secureStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gruenerator.eu/api';
const REDIRECT_URI = 'gruenerator-docs://auth/callback';

export interface DocsCapacitorUser {
  id: string;
  email?: string;
  username?: string;
  display_name?: string;
  avatar_robot_id?: number;
  keycloak_id?: string | null;
  [key: string]: unknown;
}

interface TokenResponse {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: DocsCapacitorUser;
  error?: string;
  message?: string;
}

type AppUrlOpenListener = { remove: () => Promise<void> };

let appUrlCleanup: AppUrlOpenListener | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function initCapacitorAuth(
  onAuthSuccess: (user: DocsCapacitorUser) => void,
  onAuthError: (error: string) => void
): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    const listener = await App.addListener('appUrlOpen', async (event) => {
      console.log('[DocsAuth] appUrlOpen received:', event.url);

      if (!event.url.startsWith('gruenerator-docs://auth/callback')) return;

      try {
        const parsedUrl = new URL(event.url);
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');

        console.log(
          '[DocsAuth] Parsed deep link — has code:',
          !!code,
          ', has error:',
          !!error,
          ', full search:',
          parsedUrl.search
        );

        if (error) {
          onAuthError(error);
          return;
        }

        if (!code) {
          onAuthError(
            `No authentication code received. Deep link URL: ${event.url.substring(0, 200)}`
          );
          return;
        }

        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {
          // Browser might already be closed
        }

        const result = await exchangeCodeForToken(code);
        if (result.success && result.user) {
          scheduleTokenRefresh();
          onAuthSuccess(result.user);
        } else {
          onAuthError(result.error || 'Authentication failed');
        }
      } catch (err) {
        onAuthError(err instanceof Error ? err.message : 'Unknown error');
      }
    });

    appUrlCleanup = listener;

    // Restore existing session
    await restoreSession(onAuthSuccess);
  } catch (error) {
    console.error('[DocsAuth] Failed to initialize:', error);
  }
}

async function restoreSession(onAuthSuccess: (user: DocsCapacitorUser) => void): Promise<void> {
  const hasAuth = await storage.hasStoredAuth();
  if (!hasAuth) return;

  const user = await storage.getStoredUser();
  if (!user) {
    await storage.clearTokens();
    return;
  }

  if (await storage.isTokenExpired()) {
    const result = await refreshAccessToken();
    if (!result.success) {
      await storage.clearTokens();
      return;
    }
  }

  const accessToken = await storage.getAccessToken();
  if (accessToken && user) {
    scheduleTokenRefresh();
    onAuthSuccess(user as DocsCapacitorUser);
  }
}

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

export async function openLogin(): Promise<void> {
  try {
    const { Browser } = await import('@capacitor/browser');
    const authUrl = `${API_BASE_URL}/auth/login?source=gruenerator-login&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;
    await Browser.open({
      url: authUrl,
      presentationStyle: 'popover',
      toolbarColor: '#008939',
    });
  } catch (error) {
    console.error('[DocsAuth] Failed to open browser:', error);
    throw error;
  }
}

async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  user?: DocsCapacitorUser;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/mobile/consume-login-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = (await response.json()) as TokenResponse;

    if (response.ok && data.success && data.access_token && data.refresh_token && data.user) {
      await storage.saveTokens(data.access_token, data.refresh_token, data.user, data.expires_in);
      return { success: true, user: data.user };
    }

    return { success: false, error: data.error || data.message || 'Invalid response' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function refreshAccessToken(): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return { success: false, error: 'No refresh token' };

  try {
    const response = await fetch(`${API_BASE_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = (await response.json()) as TokenResponse;

    if (response.ok && data.success && data.access_token) {
      await storage.updateAccessToken(data.access_token, data.expires_in);
      if (data.user) await storage.updateStoredUser(data.user);
      return { success: true, accessToken: data.access_token };
    }

    if (
      data.error === 'token_expired' ||
      data.error === 'token_revoked' ||
      data.error === 'invalid_refresh_token'
    ) {
      await storage.clearTokens();
    }

    return { success: false, error: data.error || 'Failed to refresh' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function scheduleTokenRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  // Refresh 2 minutes before expiry (tokens last 15 min, so refresh at ~13 min)
  refreshTimer = setTimeout(
    async () => {
      const result = await refreshAccessToken();
      if (result.success) scheduleTokenRefresh();
    },
    13 * 60 * 1000
  );
}

export async function getValidAccessToken(): Promise<string | null> {
  if (await storage.isTokenExpired()) {
    const result = await refreshAccessToken();
    if (result.success && result.accessToken) return result.accessToken;
    return null;
  }
  return storage.getAccessToken();
}

export async function logout(): Promise<void> {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  try {
    const refreshToken = await storage.getRefreshToken();
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/auth/mobile/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }
  } catch {
    // Best-effort server logout
  }

  await storage.clearTokens();
}
