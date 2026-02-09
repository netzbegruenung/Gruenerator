'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Platform-agnostic interface for chat API communication.
 *
 * Each consumer (Next.js app, Vite web, Tauri desktop, Expo mobile)
 * provides its own adapter implementation.
 */
export interface ChatAdapter {
  /** Perform a fetch request with appropriate auth (cookies, bearer, etc.) */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Base URL for the API (e.g. 'https://api.gruenerator.de' or '') */
  getApiBaseUrl(): string;
  /** Get auth headers for non-fetch usage (e.g. SSE streams) */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Called on 401 — redirect to login or show auth UI */
  onUnauthorized(): void;
}

/**
 * Typed API client derived from a ChatAdapter.
 * Used by Zustand stores which can't call React hooks.
 */
export interface ChatApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

/**
 * Create a ChatApiClient from a ChatAdapter.
 */
export function createApiClient(adapter: ChatAdapter): ChatApiClient {
  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${adapter.getApiBaseUrl()}${endpoint}`;

    const response = await adapter.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      adapter.onUnauthorized();
      throw new Error('Unauthorized');
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
    delete: <T,>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  };
}

const ChatAdapterContext = createContext<ChatAdapter | null>(null);

export function ChatProvider({ adapter, children }: { adapter: ChatAdapter; children: ReactNode }) {
  return <ChatAdapterContext.Provider value={adapter}>{children}</ChatAdapterContext.Provider>;
}

export function useChatAdapter(): ChatAdapter {
  const adapter = useContext(ChatAdapterContext);
  if (!adapter) {
    throw new Error('useChatAdapter must be used within a ChatProvider');
  }
  return adapter;
}
