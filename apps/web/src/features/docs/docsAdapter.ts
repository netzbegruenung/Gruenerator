import { handleUnauthorized } from '../../components/utils/apiClient';
import { sessionDebug } from '../../lib/sessionDebug';
import { useAuthStore } from '../../stores/authStore';
import { isDesktopApp } from '../../utils/platform';

import type { DocsAdapter } from '@gruenerator/docs';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

/**
 * Derive the Hocuspocus WebSocket URL.
 *
 * Deriving from `window.location` breaks in the desktop (Tauri) shell: the
 * webview is served from `tauri://localhost`, so `window.location.host` is
 * `localhost` and `window.location.protocol` is `tauri:` (not `https:`) — the
 * old logic fell through to `ws://localhost:1240` and the collab socket tried
 * to reach the user's own machine instead of the production server, so
 * documents never synced.
 *
 * When the API base is an absolute URL (always true on desktop, where it's
 * baked to `https://gruenerator.eu/api`, and in web prod) derive the WS host
 * from it instead — `/api` → `/ws`, `https` → `wss`. Falls back to the old
 * window-based logic only in dev, where the API base is the relative `/api`.
 */
function deriveHocuspocusUrl(): string {
  if (API_BASE_URL.startsWith('http')) {
    try {
      const { protocol, host } = new URL(API_BASE_URL);
      return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
    } catch {
      // Malformed base — fall through to the window-based default.
    }
  }
  return window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : 'ws://localhost:1240';
}

const HOCUSPOCUS_URL =
  (import.meta.env.VITE_HOCUSPOCUS_URL as string | undefined) ?? deriveHocuspocusUrl();

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

  onUnauthorized: async () => {
    sessionDebug('http.401', { stack: 'docs' });
    // Route through the shared authority (probe → retry/atomic-teardown/stay)
    // instead of an unconditional redirect that races the other stacks.
    return (await handleUnauthorized('docs')) === 'retry';
  },

  getDocumentUrl: (id) => `/office/${id}`,

  navigateToDocument: (id) => {
    window.location.href = `/office/${id}`;
  },

  navigateToHome: () => {
    window.location.href = '/office';
  },

  getCurrentUserDisplayName: () => useAuthStore.getState().user?.display_name ?? null,
};
