import {
  createApiClient,
  setGlobalApiClient,
  getGlobalApiClient,
  apiRequest,
} from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';
import axios from 'axios';

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

let isRefreshing = false;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    const refreshToken = await secureStorage.getRefreshToken();
    if (!refreshToken) return false;

    const response = await axios.post(`${API_BASE_URL}/auth/mobile/refresh`, {
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
    onUnauthorized: async () => {
      const refreshed = await tryRefreshToken();
      if (!refreshed) {
        console.log('[API] Token refresh failed - clearing auth state');
        await secureStorage.clearAll();
        useAuthStore.getState().clearAuth();
      }
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
  AUTH_MOBILE_CONSUME: '/auth/mobile/consume-login-code',
  AUTH_MOBILE_REFRESH: '/auth/mobile/refresh',
  AUTH_MOBILE_STATUS: '/auth/mobile/status',
  AUTH_MOBILE_LOGOUT: '/auth/mobile/logout',
  AUTH_PROFILE: '/auth/profile',
  AUTH_PROFILE_AVATAR: '/auth/profile/avatar',
  AUTH_PROFILE_COLOR: '/auth/profile/message-color',
  AUTH_PROFILE_LOCALE: '/auth/locale',
  AUTH_PROFILE_IGEL: '/auth/profile/igel-modus',
  // Edit
  SUGGEST_EDITS: '/claude_suggest_edits',
} as const;
