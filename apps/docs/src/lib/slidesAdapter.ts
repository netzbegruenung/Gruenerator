import { type SlidesAdapter } from '@gruenerator/slides';

import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const PRESENTON_API_BASE_URL = import.meta.env.VITE_PRESENTON_API_BASE_URL || '/presenton-api';

/**
 * Web (Vite SPA) implementation of SlidesAdapter.
 * Uses session cookies for auth and the Vite dev proxy for API calls.
 */
export const webSlidesAdapter: SlidesAdapter = {
  fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),

  getApiBaseUrl: () => API_BASE_URL,

  getPresenterApiBaseUrl: () => PRESENTON_API_BASE_URL,

  getAuthHeaders: async () => ({}),

  onUnauthorized: () => {
    const currentPath = window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
  },

  navigateToPresentation: (id) => {
    window.location.href = `/presentation/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/';
  },

  getCurrentUserDisplayName: () => useAuthStore.getState().user?.display_name ?? null,
};
