import {
  createApiClient,
  setGlobalApiClient,
  getGlobalApiClient,
  apiRequest,
} from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';
import axios from 'axios';

import { secureStorage } from './storage';

import type { User } from '@gruenerator/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

let isRefreshing = false;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    const refreshToken = await secureStorage.getRefreshToken();
    if (!refreshToken) return false;

    interface RefreshResponse {
      success: boolean;
      access_token?: string;
      user?: User;
    }
    const response = await axios.post<RefreshResponse>(`${API_BASE_URL}/auth/mobile/refresh`, {
      refresh_token: refreshToken,
    });

    if (response.data.success && response.data.access_token) {
      await secureStorage.setToken(response.data.access_token);
      if (response.data.user) {
        await secureStorage.setUser(JSON.stringify(response.data.user));
        useAuthStore.getState().setAuthState({ user: response.data.user });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

export function initializeApiClient(): void {
  const client = createApiClient({
    baseURL: API_BASE_URL,
    authMode: 'bearer',
    getAuthToken: async () => {
      return secureStorage.getToken();
    },
    onUnauthorized: async (): Promise<boolean> => {
      const refreshed = await tryRefreshToken();
      if (!refreshed) {
        await secureStorage.clearAll();
        useAuthStore.getState().clearAuth();
        return false;
      }
      return true;
    },
    timeout: 120000,
  });

  setGlobalApiClient(client);
}

/**
 * Get the initialized API client
 */
export { getGlobalApiClient, apiRequest };

/**
 * API endpoints used by the mobile app (auth only)
 * Generator endpoints are imported from @gruenerator/shared/generators
 */
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  // Better Auth's `mobileTokenExchange` plugin endpoint — takes the login-code
  // JWT from the OAuth callback and returns an opaque session token the
  // `bearer()` plugin recognises. Replaces the legacy HS256 mint at
  // `/auth/mobile/consume-login-code`.
  AUTH_TOKEN_EXCHANGE_CODE: '/auth/v2/token-exchange-code',
  AUTH_MOBILE_CONSUME: '/auth/mobile/consume-login-code',
  AUTH_MOBILE_REFRESH: '/auth/mobile/refresh',
  AUTH_MOBILE_LOGOUT: '/auth/mobile/logout',
  AUTH_PROFILE: '/auth/profile',
  AUTH_PROFILE_AVATAR: '/auth/profile/avatar',
  AUTH_PROFILE_COLOR: '/auth/profile/message-color',
  AUTH_PROFILE_LOCALE: '/auth/locale',
} as const;
