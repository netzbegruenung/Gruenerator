import type { DocsAdapter } from '@gruenerator/docs';

const HOCUSPOCUS_URL = import.meta.env.VITE_HOCUSPOCUS_URL || 'ws://localhost:1240';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Web (Vite SPA) implementation of DocsAdapter.
 * Uses session cookies for auth and the Vite dev proxy for API calls.
 */
export const webDocsAdapter: DocsAdapter = {
  fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),

  getApiBaseUrl: () => API_BASE_URL,

  getHocuspocusUrl: () => HOCUSPOCUS_URL,

  getHocuspocusToken: async () => null,

  getAuthHeaders: async () => ({}),

  onUnauthorized: () => {
    const currentPath = window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
  },

  navigateToDocument: (id) => {
    window.location.href = `/document/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/';
  },
};
