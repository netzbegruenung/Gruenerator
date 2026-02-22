import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { secureStorage } from './storage';
import { getGlobalApiClient, API_ENDPOINTS } from './api';
import { useAuthStore, setAuthStoreConfig } from '@gruenerator/shared/stores';
import type { User } from '@gruenerator/shared';
import { getErrorMessage } from '../utils/errors';
import { API_BASE_URL } from '../config';

WebBrowser.maybeCompleteAuthSession();

export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

export const REDIRECT_URI = makeRedirectUri({
  scheme: 'gruenerator',
  path: 'auth/callback',
});

interface ConsumeLoginCodeResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user: User;
  expires_in: number;
  token_type: string;
}

interface AuthStatusResponse {
  isAuthenticated: boolean;
  user: User | null;
  authMethod: string;
  tokenInfo?: {
    issuer: string;
    audience: string;
    expiresAt: number;
  };
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

    updateIgelModusApi: async (enabled: boolean) => {
      await apiClient.patch(API_ENDPOINTS.AUTH_PROFILE_IGEL, { igel_modus: enabled });
    },
  });
}

export async function login(source: AuthSource): Promise<{ success: boolean; error?: string }> {
  try {
    const authUrl = `${API_BASE_URL}${API_ENDPOINTS.AUTH_LOGIN}?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');

      if (code) {
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
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function handleAuthCallback(
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const apiClient = getGlobalApiClient();

    const response = await apiClient.post<ConsumeLoginCodeResponse>(
      API_ENDPOINTS.AUTH_MOBILE_CONSUME,
      { code }
    );

    if (response.data.success && response.data.access_token && response.data.user) {
      await secureStorage.setToken(response.data.access_token);
      if (response.data.refresh_token) {
        await secureStorage.setRefreshToken(response.data.refresh_token);
      }
      await secureStorage.setUser(JSON.stringify(response.data.user));

      useAuthStore.getState().setAuthState({
        user: response.data.user,
      });

      return { success: true };
    }

    return { success: false, error: 'Invalid response from server' };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Refresh the access token using the stored refresh token.
 * Returns the new access token or null if refresh failed.
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await secureStorage.getRefreshToken();
    console.log('[Auth] refreshAccessToken, has refresh token:', !!refreshToken);
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    console.log('[Auth] refresh response:', response.status);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.access_token) {
      await secureStorage.setToken(data.access_token);
      if (data.user) {
        await secureStorage.setUser(JSON.stringify(data.user));
        useAuthStore.getState().setAuthState({ user: data.user });
      }
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if the current one is expired.
 */
export async function getValidToken(): Promise<string | null> {
  const token = await secureStorage.getToken();
  console.log('[Auth] getValidToken, has stored token:', !!token);
  if (!token) return null;

  // Try a quick status check to see if token is still valid
  try {
    const response = await fetch(`${API_BASE_URL}/auth/mobile/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('[Auth] status check:', response.status);
    if (response.ok) return token;
  } catch (err) {
    console.log('[Auth] status check network error:', err);
    return token;
  }

  // Token expired — try refresh
  console.log('[Auth] token expired, attempting refresh');
  return refreshAccessToken();
}

export async function checkAuthStatus(): Promise<boolean> {
  try {
    const token = await secureStorage.getToken();
    const refreshToken = await secureStorage.getRefreshToken();
    console.log('[Auth] checkAuthStatus: has token:', !!token, 'has refresh:', !!refreshToken);
    if (!token) {
      useAuthStore.getState().setLoading(false);
      return false;
    }

    const apiClient = getGlobalApiClient();

    try {
      const response = await apiClient.get<AuthStatusResponse>(API_ENDPOINTS.AUTH_MOBILE_STATUS);

      if (response.data.isAuthenticated && response.data.user) {
        useAuthStore.getState().setAuthState({
          user: response.data.user,
        });
        return true;
      }
    } catch {
      // Token might be expired — try refresh
      const newToken = await refreshAccessToken();
      if (newToken) {
        const response = await apiClient.get<AuthStatusResponse>(API_ENDPOINTS.AUTH_MOBILE_STATUS);
        if (response.data.isAuthenticated && response.data.user) {
          useAuthStore.getState().setAuthState({
            user: response.data.user,
          });
          return true;
        }
      }
    }

    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setLoading(false);
    return false;
  } catch (error: unknown) {
    useAuthStore.getState().setLoading(false);
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    useAuthStore.getState().setLoggingOut(true);

    const apiClient = getGlobalApiClient();
    await apiClient.post(API_ENDPOINTS.AUTH_MOBILE_LOGOUT).catch(() => {});
  } finally {
    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setLoggingOut(false);
  }
}

export async function getStoredToken(): Promise<string | null> {
  return secureStorage.getToken();
}
