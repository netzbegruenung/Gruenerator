import type { DocsAdapter } from '@gruenerator/docs';
import { getValidAccessToken, refreshAccessToken } from '../auth/capacitorAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gruenerator.eu/api';
const HOCUSPOCUS_URL = import.meta.env.VITE_HOCUSPOCUS_URL || 'wss://docs.gruenerator.eu:1240';

/**
 * Capacitor (native) implementation of DocsAdapter.
 * Uses Bearer tokens instead of cookies for all API calls.
 */
export const capacitorDocsAdapter: DocsAdapter = {
  fetch: async (url, options) => {
    const token = await getValidAccessToken();
    const headers = new Headers(options?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });

    // Auto-retry once on 401
    if (response.status === 401) {
      const result = await refreshAccessToken();
      if (result.success && result.accessToken) {
        headers.set('Authorization', `Bearer ${result.accessToken}`);
        return fetch(url, { ...options, headers });
      }
    }

    return response;
  },

  getApiBaseUrl: () => API_BASE_URL,

  getHocuspocusUrl: () => HOCUSPOCUS_URL,

  getHocuspocusToken: async () => getValidAccessToken(),

  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await getValidAccessToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  },

  onUnauthorized: () => {
    window.location.href = '/login';
  },

  navigateToDocument: (id) => {
    window.location.href = `/document/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/';
  },
};
