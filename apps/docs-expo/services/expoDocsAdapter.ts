import type { DocsAdapter } from '@gruenerator/docs';
import type { Router } from 'expo-router';
import { secureStorage } from './storage';
import { API_BASE_URL, HOCUSPOCUS_URL } from '../config';

let _router: Router | null = null;

/**
 * Set the expo-router instance so the adapter can navigate.
 * Call this once from the root layout.
 */
export function setAdapterRouter(router: Router): void {
  _router = router;
}

/**
 * Expo (native) implementation of DocsAdapter.
 * Uses Bearer tokens from expo-secure-store for all API calls.
 */
export const expoDocsAdapter: DocsAdapter = {
  fetch: async (url, options) => {
    const token = await secureStorage.getToken();
    const headers = new Headers(options?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      expoDocsAdapter.onUnauthorized();
    }

    return response;
  },

  getApiBaseUrl: () => API_BASE_URL,

  getHocuspocusUrl: () => HOCUSPOCUS_URL,

  getHocuspocusToken: async () => secureStorage.getToken(),

  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await secureStorage.getToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  },

  onUnauthorized: () => {
    if (_router) {
      _router.replace('/(auth)/login');
    }
  },

  navigateToDocument: (id) => {
    if (_router) {
      _router.push({ pathname: '/document/[id]', params: { id } });
    }
  },

  navigateToHome: () => {
    if (_router) {
      _router.push('/');
    }
  },
};
