import { useAuthStore } from '../../stores/authStore';
import { buildLoginUrl } from '../../utils/authRedirect';
import { isDesktopApp } from '../../utils/platform';

import type { SlidesAdapter } from '@gruenerator/slides';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const PRESENTON_API_BASE_URL = import.meta.env.VITE_PRESENTON_API_BASE_URL || '/presenton-api';

async function getPlatformToken(): Promise<string | null> {
  if (isDesktopApp()) {
    const { getDesktopToken } = await import('../../utils/desktopAuth');
    return getDesktopToken();
  }
  return null;
}

async function platformFetch(url: string, options?: RequestInit): Promise<Response> {
  if (isDesktopApp()) {
    const token = await getPlatformToken();
    const headers = new Headers(options?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }
  return fetch(url, { ...options, credentials: 'include' });
}

export const webAppSlidesAdapter: SlidesAdapter = {
  fetch: platformFetch,

  getApiBaseUrl: () => API_BASE_URL,

  getPresenterApiBaseUrl: () => PRESENTON_API_BASE_URL,

  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await getPlatformToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  },

  onUnauthorized: () => {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = buildLoginUrl(currentPath);
  },

  navigateToPresentation: (id: string) => {
    window.location.href = `/docs/presentation/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/docs';
  },

  getCurrentUserDisplayName: () => useAuthStore.getState().user?.display_name ?? null,
};
