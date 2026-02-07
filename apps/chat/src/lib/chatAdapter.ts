import type { ChatAdapter } from '@gruenerator/chat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Cookie-based ChatAdapter for the Next.js chat app.
 * Uses credentials: 'include' for session cookies and
 * redirects to login on 401.
 */
export const webChatAdapter: ChatAdapter = {
  fetch: (url: string, options?: RequestInit) =>
    fetch(url, { ...options, credentials: 'include' }),

  getApiBaseUrl: () => API_BASE_URL,

  getAuthHeaders: async () => ({}),

  onUnauthorized: () => {
    const currentPath = typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/';
    const loginUrl = `${API_BASE_URL}/api/auth/login?source=gruenerator-chat&redirectTo=${encodeURIComponent(currentPath)}`;
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    }
  },
};
