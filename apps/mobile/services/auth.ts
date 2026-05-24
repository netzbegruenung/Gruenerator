import { useAuthStore, setAuthStoreConfig } from '@gruenerator/shared/stores';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { getErrorMessage } from '../utils/errors';

import { getGlobalApiClient, API_ENDPOINTS } from './api';
import { secureStorage } from './storage';

import type { User } from '@gruenerator/shared';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

export const REDIRECT_URI = makeRedirectUri({
  scheme: 'gruenerator',
  path: 'auth/callback',
});

// Response shape from Better Auth's `mobileTokenExchange` plugin endpoint at
// `/api/auth/v2/token-exchange-code`. The `token` field is an opaque Better
// Auth session token that the `bearer()` plugin teaches `getSession` to
// accept as a drop-in for the session cookie.
interface TokenExchangeCodeResponse {
  token: string;
  user: User;
  expiresAt: string;
}

export function configureAuthStore(): void {
  const apiClient = getGlobalApiClient();

  setAuthStoreConfig({
    onClearAuth: async () => {
      await secureStorage.clearAll();
    },

    updateProfileApi: async (data: Partial<User>) => {
      const response = await apiClient.put<{ user: User }>(API_ENDPOINTS.AUTH_PROFILE, data);
      return response.data.user;
    },

    updateAvatarApi: async (avatarRobotId: string) => {
      const response = await apiClient.patch<{ user: User }>(API_ENDPOINTS.AUTH_PROFILE_AVATAR, {
        avatar_robot_id: avatarRobotId,
      });
      return response.data.user;
    },

    updateMessageColorApi: async (color: string) => {
      await apiClient.patch(API_ENDPOINTS.AUTH_PROFILE_COLOR, { color });
    },

    updateLocaleApi: async (locale: 'de-DE' | 'de-AT') => {
      await apiClient.put(API_ENDPOINTS.AUTH_PROFILE_LOCALE, { locale });
    },
  });
}

/**
 * Start the OAuth flow. Opens a Chrome Custom Tab to the API's /auth/login
 * entry point, which routes through Better Auth → Keycloak → Better Auth
 * callback → /auth/app-callback. The callback deep-links back to us with a
 * short-lived login code JWT.
 */
export async function login(source: AuthSource): Promise<{ success: boolean; error?: string }> {
  try {
    const authUrl = `${API_BASE_URL}${API_ENDPOINTS.AUTH_LOGIN}?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;

    console.log('[Auth] Opening auth session:', authUrl);
    console.log('[Auth] Redirect URI:', REDIRECT_URI);

    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    console.log('[Auth] Browser result:', result.type);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');

      if (code) {
        console.log('[Auth] Received login code, exchanging...');
        return await handleAuthCallback(code);
      } else {
        const error = url.searchParams.get('error');
        return { success: false, error: error || 'No code received' };
      }
    } else if (result.type === 'cancel') {
      return { success: false, error: 'Login cancelled' };
    } else {
      return { success: false, error: 'Login failed' };
    }
  } catch (error: unknown) {
    console.error('[Auth] Login error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

// On Android, an OAuth callback URL is delivered to BOTH the WebBrowser
// Custom Tab (resolving openAuthSessionAsync's promise in login()) AND the
// Android Intent system (which Expo Router routes to /auth/callback.tsx).
// Without deduplication, the same one-shot JWT would be exchanged twice,
// both writers would mutate useAuthStore, and two concurrent router.replace
// calls would tear down the Fabric root. This cache ensures exactly one
// HTTP exchange per code; every subsequent caller awaits the same promise.
const inFlightExchanges = new Map<string, Promise<{ success: boolean; error?: string }>>();

/**
 * Exchange a one-shot login-code JWT for a Better Auth session token.
 *
 * Idempotent by `code`: repeated calls with the same code await the first
 * in-flight request instead of issuing a new one.
 */
export async function handleAuthCallback(
  code: string
): Promise<{ success: boolean; error?: string }> {
  const existing = inFlightExchanges.get(code);
  if (existing) {
    return existing;
  }

  const promise = exchangeCodeForTokens(code);
  inFlightExchanges.set(code, promise);
  return promise;
}

/**
 * The Better Auth session / token-exchange payload only carries auth identity
 * (id, email, name). Profile fields like `display_name`, `avatar_robot_id` and
 * `locale` live in the `profiles` table and are served by GET /auth/profile.
 * Fetch that and merge it into the stored user so UI reading `user.display_name`
 * (e.g. the start-screen greeting) shows the real name instead of the
 * "Grüner" fallback.
 */
async function hydrateProfile(): Promise<void> {
  try {
    const apiClient = getGlobalApiClient();
    const response = await apiClient.get<{ success: boolean; user?: User }>(
      API_ENDPOINTS.AUTH_PROFILE
    );
    const profile = response.data?.user;
    if (profile) {
      const merged = { ...useAuthStore.getState().user, ...profile } as User;
      await secureStorage.setUser(JSON.stringify(merged));
      useAuthStore.getState().setAuthState({ user: merged });
    }
  } catch (error: unknown) {
    console.warn('[Auth] Profile hydration failed:', getErrorMessage(error));
  }
}

async function exchangeCodeForTokens(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const apiClient = getGlobalApiClient();

    const response = await apiClient.post<TokenExchangeCodeResponse>(
      API_ENDPOINTS.AUTH_TOKEN_EXCHANGE_CODE,
      { code }
    );

    if (response.data.token && response.data.user) {
      await secureStorage.setToken(response.data.token);
      await secureStorage.setUser(JSON.stringify(response.data.user));

      useAuthStore.getState().setAuthState({
        user: response.data.user,
      });
      await hydrateProfile();

      console.log('[Auth] Login successful for:', response.data.user.email);
      return { success: true };
    }

    return { success: false, error: 'Invalid response from server' };
  } catch (error: unknown) {
    console.error('[Auth] Callback error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Probe the Better Auth session for the stored bearer token. The bearer()
 * plugin lets /auth/v2/get-session accept `Authorization: Bearer <token>`
 * the same way it accepts a cookie on web.
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const token = await secureStorage.getToken();
    if (!token) {
      useAuthStore.getState().setLoading(false);
      return false;
    }

    const apiClient = getGlobalApiClient();
    const response = await apiClient.get<{ user?: User; session?: unknown } | null>(
      API_ENDPOINTS.AUTH_GET_SESSION
    );

    if (response.data && response.data.user) {
      useAuthStore.getState().setAuthState({ user: response.data.user });
      await hydrateProfile();
      return true;
    }

    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    return false;
  } catch (error: unknown) {
    console.error('[Auth] Status check error:', error);
    useAuthStore.getState().setLoading(false);
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    useAuthStore.getState().setLoggingOut(true);

    const apiClient = getGlobalApiClient();
    await apiClient.post(API_ENDPOINTS.AUTH_MOBILE_LOGOUT).catch((err: unknown) => {
      // Server-side session invalidation is best-effort; local cleanup is
      // what actually logs the user out on the device. The previous
      // empty-arrow .catch hid every server-side logout failure (Better Auth
      // 500s, network drops, expired bearer tokens) — log to surface in the
      // React Native console + Metro logs. Server-side captures land in
      // GlitchTip via the `onAPIError` hook in `apps/api/config/betterAuth.ts`
      // (PR #974), so we don't need a client-side Sentry SDK here.
      console.error('[Auth] Logout endpoint failed (proceeding with local cleanup):', err);
    });
  } finally {
    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setLoggingOut(false);
  }
}

export async function getStoredToken(): Promise<string | null> {
  return secureStorage.getToken();
}
