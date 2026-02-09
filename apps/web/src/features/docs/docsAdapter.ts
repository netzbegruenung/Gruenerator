import { buildLoginUrl } from '../../utils/authRedirect';
import { isDesktopApp } from '../../utils/platform';

import type { DocsAdapter } from '@gruenerator/docs';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const HOCUSPOCUS_URL = import.meta.env.VITE_HOCUSPOCUS_URL || 'ws://localhost:1240';

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

export const webAppDocsAdapter: DocsAdapter = {
  fetch: platformFetch,

  getApiBaseUrl: () => API_BASE_URL,

  getHocuspocusUrl: () => HOCUSPOCUS_URL,

  getHocuspocusToken: async () => getPlatformToken(),

  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await getPlatformToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  },

  onUnauthorized: () => {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = buildLoginUrl(currentPath);
  },

  navigateToDocument: (id) => {
    window.location.href = `/docs/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/docs';
  },
};
