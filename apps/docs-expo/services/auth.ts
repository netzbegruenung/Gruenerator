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

export async function checkAuthStatus(): Promise<boolean> {
  try {
    const token = await secureStorage.getToken();
    if (!token) {
      useAuthStore.getState().setLoading(false);
      return false;
    }

    const apiClient = getGlobalApiClient();
    const response = await apiClient.get<AuthStatusResponse>(API_ENDPOINTS.AUTH_MOBILE_STATUS);

    if (response.data.isAuthenticated && response.data.user) {
      useAuthStore.getState().setAuthState({
        user: response.data.user,
      });
      return true;
    }

    await secureStorage.clearAll();
    useAuthStore.getState().clearAuth();
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
