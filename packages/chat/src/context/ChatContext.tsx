/**
 * Chat API client with injectable config via chatConfigStore.
 *
 * createChatApiClient() builds a ChatApiClient from any fetch function +
 * unauthorized handler. The module-level chatFetch / chatApiClient exports
 * use the config store's current values for backwards compatibility.
 */

import { UnauthorizedError } from '@gruenerator/shared/api';

import { useChatConfigStore } from '../stores/chatConfigStore';

export interface ChatApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  patch<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

export function createChatApiClient(
  fetchFn: (url: string, options?: RequestInit) => Promise<Response>,
  onUnauthorized: () => void | boolean | Promise<boolean | void>
): ChatApiClient {
  async function request<T>(
    endpoint: string,
    options: RequestInit = {},
    retried = false
  ): Promise<T> {
    const response = await fetchFn(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // A truthy return means "probe says the session is alive — retry once".
      // Otherwise throw a typed error (message stays 'Unauthorized' for the
      // chat runtime's unhandled-rejection suppressor) so callers can tell an
      // auth failure apart from an offline/network error.
      const shouldRetry = await onUnauthorized();
      if (shouldRetry && !retried) {
        return request<T>(endpoint, options, true);
      }
      throw new UnauthorizedError();
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      throw new Error(errorData.message || errorData.error || 'Request failed');
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }

    return response as unknown as T;
  }

  return {
    get: <T,>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
    post: <T,>(endpoint: string, data?: unknown) =>
      request<T>(endpoint, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      }),
    patch: <T,>(endpoint: string, data?: unknown) =>
      request<T>(endpoint, {
        method: 'PATCH',
        body: data ? JSON.stringify(data) : undefined,
      }),
    delete: <T,>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  };
}

/** Backwards-compatible fetch — delegates to the config store's current fetch. */
export function chatFetch(url: string, options?: RequestInit): Promise<Response> {
  return useChatConfigStore.getState().fetch(url, options);
}

/** Backwards-compatible singleton — delegates to the config store's current config. */
export const chatApiClient: ChatApiClient = {
  get: <T,>(endpoint: string) => {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    return createChatApiClient(fetchFn, onUnauthorized).get<T>(endpoint);
  },
  post: <T,>(endpoint: string, data?: unknown) => {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    return createChatApiClient(fetchFn, onUnauthorized).post<T>(endpoint, data);
  },
  patch: <T,>(endpoint: string, data?: unknown) => {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    return createChatApiClient(fetchFn, onUnauthorized).patch<T>(endpoint, data);
  },
  delete: <T,>(endpoint: string) => {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    return createChatApiClient(fetchFn, onUnauthorized).delete<T>(endpoint);
  },
};
