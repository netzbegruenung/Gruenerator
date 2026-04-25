import {
  createApiClient,
  setGlobalApiClient,
  getGlobalApiClient,
  apiRequest,
} from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export function initializeApiClient(): void {
  const client = createApiClient({
    baseURL: API_BASE_URL,
    authMode: 'bearer',
    getAuthToken: async () => {
      return secureStorage.getToken();
    },
    // Better Auth sessions auto-extend on each request via `updateAge`.
    // A 401 means the session is actually gone (rotated, revoked, or
    // expired past the rolling window), so there's nothing to refresh —
    // wipe local state and let the UI route back to login.
    onUnauthorized: async (): Promise<boolean> => {
      await secureStorage.clearAll();
      useAuthStore.getState().clearAuth();
      return false;
    },
    timeout: 120000,
  });

  setGlobalApiClient(client);
}

export { getGlobalApiClient, apiRequest };

/**
 * API endpoints used by the mobile app (auth only).
 * Generator endpoints are imported from @gruenerator/shared/generators.
 */
export const API_ENDPOINTS = {
  AUTH_LOGIN: '/auth/login',
  // Better Auth's `mobileTokenExchange` plugin endpoint — takes the login-code
  // JWT from the OAuth callback and returns an opaque session token the
  // `bearer()` plugin recognises.
  AUTH_TOKEN_EXCHANGE_CODE: '/auth/v2/token-exchange-code',
  // Better Auth's native session endpoint; works with both cookies (web)
  // and Bearer tokens (mobile, via the `bearer()` plugin).
  AUTH_GET_SESSION: '/auth/v2/get-session',
  AUTH_MOBILE_LOGOUT: '/auth/mobile/logout',
  AUTH_PROFILE: '/auth/profile',
  AUTH_PROFILE_AVATAR: '/auth/profile/avatar',
  AUTH_PROFILE_COLOR: '/auth/profile/message-color',
  AUTH_PROFILE_LOCALE: '/auth/locale',
} as const;
