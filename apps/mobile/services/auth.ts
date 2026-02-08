import { useAuthStore, setAuthStoreConfig } from '@gruenerator/shared/stores';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { getErrorMessage } from '../utils/errors';

import { getGlobalApiClient, API_ENDPOINTS } from './api';
import { secureStorage } from './storage';

import type { User } from '@gruenerator/shared';

// Enable browser result handling for OAuth
WebBrowser.maybeCompleteAuthSession();

// API base URL - should match api.ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

// Auth source types matching backend
export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

// OAuth redirect URI for deep linking
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

/**
 * Response from auth status endpoint
 */
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

/**
 * Configure the auth store with mobile-specific API implementations
 */
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

/**
 * Initiate OAuth login flow
 * Opens system browser to Keycloak login page
 */
export async function login(source: AuthSource): Promise<{ success: boolean; error?: string }> {
  try {
    // Build auth URL with redirect back to app
    const authUrl = `${API_BASE_URL}${API_ENDPOINTS.AUTH_LOGIN}?source=${source}&redirectTo=${encodeURIComponent(REDIRECT_URI)}`;

    console.log('[Auth] Opening auth session:', authUrl);
    console.log('[Auth] Redirect URI:', REDIRECT_URI);

    // Open browser for OAuth flow
    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    console.log('[Auth] Browser result:', result.type);

    if (result.type === 'success' && result.url) {
      // Extract code from redirect URL
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

/**
 * Exchange login code for JWT and store credentials
 */
export async function handleAuthCallback(
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const apiClient = getGlobalApiClient();

    // Exchange code for JWT
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
 * Check if user is authenticated and restore session
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const token = await secureStorage.getToken();
    if (!token) {
      useAuthStore.getState().setLoading(false);
      return false;
    }

    // Verify token with backend
    const apiClient = getGlobalApiClient();
    const response = await apiClient.get<AuthStatusResponse>(API_ENDPOINTS.AUTH_MOBILE_STATUS);

    if (response.data.isAuthenticated && response.data.user) {
      useAuthStore.getState().setAuthState({
        user: response.data.user,
      });
      return true;
    }

    // Token invalid - clear storage
    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    return false;
  } catch (error: unknown) {
    console.error('[Auth] Status check error:', error);
    useAuthStore.getState().setLoading(false);
    return false;
  }
}

/**
 * Logout user and clear all stored data
 */
export async function logout(): Promise<void> {
  try {
    useAuthStore.getState().setLoggingOut(true);

    // Notify backend
    const apiClient = getGlobalApiClient();
    await apiClient.post(API_ENDPOINTS.AUTH_MOBILE_LOGOUT).catch(() => {
      // Ignore errors - we're logging out anyway
    });
  } finally {
    // Clear local state regardless of backend response
    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setLoggingOut(false);
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await secureStorage.getRefreshToken();
    if (!refreshToken) return null;

    const apiClient = getGlobalApiClient();
    const response = await apiClient.post<ConsumeLoginCodeResponse>(
      API_ENDPOINTS.AUTH_MOBILE_REFRESH,
      { refresh_token: refreshToken }
    );

    if (response.data.success && response.data.access_token) {
      await secureStorage.setToken(response.data.access_token);
      if (response.data.user) {
        await secureStorage.setUser(JSON.stringify(response.data.user));
        useAuthStore.getState().setAuthState({ user: response.data.user });
      }
      return response.data.access_token;
    }

    return null;
  } catch {
    return null;
  }
}

export async function getStoredToken(): Promise<string | null> {
  return secureStorage.getToken();
}
