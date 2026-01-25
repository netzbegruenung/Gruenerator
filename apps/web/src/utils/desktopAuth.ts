/**
 * Desktop (Tauri) authentication utilities
 * Uses system browser + deep-link callback for OAuth flow
 */

import { isDesktopApp } from './platform';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const REDIRECT_URI = 'gruenerator://auth/callback';

export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

interface ConsumeLoginCodeResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email?: string;
    name?: string;
    display_name?: string;
    avatar_robot_id?: string;
    keycloak_id?: string | null;
    igel_modus?: boolean;
    locale?: string;
    user_metadata?: Record<string, unknown>;
  };
  expiresIn: number;
  tokenType: string;
}

let deepLinkCleanup: (() => void) | null = null;

/**
 * Initialize desktop auth listener (call once on app start)
 */
export async function initDesktopAuth(
  onAuthSuccess: (user: ConsumeLoginCodeResponse['user'], token: string) => void,
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
        if (result.success && result.user && result.token) {
          onAuthSuccess(result.user, result.token);
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
  } catch (error) {
    console.error('[DesktopAuth] Failed to initialize:', error);
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
    const authUrl = `${API_BASE_URL}/auth/login?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;
    console.log('[DesktopAuth] Opening browser:', authUrl);
    await open(authUrl);
  } catch (error) {
    console.error('[DesktopAuth] Failed to open browser:', error);
    throw error;
  }
}

/**
 * Exchange login code for JWT token
 */
async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  user?: ConsumeLoginCodeResponse['user'];
  token?: string;
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

    const data = (await response.json()) as ConsumeLoginCodeResponse;

    if (response.ok && data.success && data.token && data.user) {
      localStorage.setItem('gruenerator_desktop_token', data.token);
      return { success: true, user: data.user, token: data.token };
    }

    return { success: false, error: 'Invalid response from server' };
  } catch (error) {
    console.error('[DesktopAuth] Token exchange failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get stored desktop token
 */
export function getDesktopToken(): string | null {
  return localStorage.getItem('gruenerator_desktop_token');
}

/**
 * Clear desktop token
 */
export function clearDesktopToken(): void {
  localStorage.removeItem('gruenerator_desktop_token');
}

/**
 * Check if user has stored desktop auth
 */
export function hasDesktopAuth(): boolean {
  return !!getDesktopToken();
}
