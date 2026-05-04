import { useChatConfigStore, createChatApiClient, type ChatApiClient } from '@gruenerator/chat';

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu';

let cachedApiClient: ChatApiClient | null = null;

async function mobileFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await secureStorage.getToken();
  const absoluteUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  return fetch(absoluteUrl, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function mobileOnUnauthorized(): void {
  console.warn('[ChatConfig] Unauthorized — session gone, user will be routed to login');
}

export function configureMobileChat(): void {
  useChatConfigStore.getState().configure({
    fetch: mobileFetch,
    onUnauthorized: mobileOnUnauthorized,
    docsBaseUrl: 'https://gruenerator.eu',
  });
  cachedApiClient = null;
}

export function getMobileChatApiClient(): ChatApiClient {
  if (!cachedApiClient) {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    cachedApiClient = createChatApiClient(fetchFn, onUnauthorized);
  }
  return cachedApiClient;
}
