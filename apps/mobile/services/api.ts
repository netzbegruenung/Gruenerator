import { createApiClient, setGlobalApiClient, getGlobalApiClient, apiRequest } from '@gruenerator/shared/api';
import { secureStorage } from './storage';
import { useAuthStore } from '@gruenerator/shared/stores';

// API base URL - should be configured via environment
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

/**
 * Initialize the API client for mobile with Bearer token auth
 * Call this once at app startup
 */
export function initializeApiClient(): void {
  const client = createApiClient({
    baseURL: API_BASE_URL,
    authMode: 'bearer',
    getAuthToken: async () => {
      return secureStorage.getToken();
    },
    onUnauthorized: () => {
      console.log('[API] Received 401 - clearing auth state');
      useAuthStore.getState().clearAuth();
    },
    timeout: 120000, // 2 minutes for mobile
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
