import {
  createApiClient,
  setGlobalApiClient,
  getGlobalApiClient,
  apiRequest,
} from '@gruenerator/shared/api';
import { secureStorage } from './storage';
import { useAuthStore } from '@gruenerator/shared/stores';
import { API_BASE_URL } from '../config';

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
    timeout: 120000,
  });

  setGlobalApiClient(client);
}

export { getGlobalApiClient, apiRequest };

export const API_ENDPOINTS = {
  AUTH_LOGIN: '/auth/login',
  AUTH_MOBILE_CONSUME: '/auth/mobile/consume-login-code',
  AUTH_MOBILE_STATUS: '/auth/mobile/status',
  AUTH_MOBILE_LOGOUT: '/auth/mobile/logout',
  AUTH_PROFILE: '/auth/profile',
  AUTH_PROFILE_AVATAR: '/auth/profile/avatar',
  AUTH_PROFILE_COLOR: '/auth/profile/message-color',
  AUTH_PROFILE_LOCALE: '/auth/locale',
  AUTH_PROFILE_IGEL: '/auth/profile/igel-modus',
} as const;
