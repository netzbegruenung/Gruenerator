import { useChatConfigStore, createChatApiClient, type ChatApiClient } from '@gruenerator/chat';

import { refreshAccessToken } from './auth';
import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

let cachedApiClient: ChatApiClient | null = null;

async function mobileFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await secureStorage.getToken();

  const absoluteUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const response = await fetch(absoluteUrl, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return fetch(absoluteUrl, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
    }
  }

  return response;
}

function mobileOnUnauthorized(): void {
  console.warn('[ChatConfig] Unauthorized — token refresh will be attempted on next request');
}

export function configureMobileChat(): void {
  useChatConfigStore.getState().configure({
    fetch: mobileFetch,
    onUnauthorized: mobileOnUnauthorized,
    docsBaseUrl: 'https://docs.gruenerator.eu',
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
