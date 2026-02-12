import type { ChatAdapter } from '@gruenerator/chat';

export const webChatAdapter: ChatAdapter = {
  fetch: (url: string, options?: RequestInit) => fetch(url, { ...options, credentials: 'include' }),
  getApiBaseUrl: () => '',
  getAuthHeaders: async () => ({}),
  onUnauthorized: () => {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
  },
};
