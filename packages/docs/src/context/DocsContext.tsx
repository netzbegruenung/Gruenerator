'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Platform-agnostic interface for docs API communication.
 *
 * Each consumer (Vite web, Tauri desktop, Capacitor mobile)
 * provides its own adapter implementation.
 */
export interface DocsAdapter {
  /** Perform a fetch request with appropriate auth (cookies, bearer, etc.) */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Base URL for the API (e.g. 'https://api.gruenerator.de' or '') */
  getApiBaseUrl(): string;
  /** Hocuspocus WebSocket URL (e.g. 'wss://hocuspocus.gruenerator.de') */
  getHocuspocusUrl(): string;
  /** Get auth token for Hocuspocus WebSocket connection (null for cookie-based) */
  getHocuspocusToken(): Promise<string | null>;
  /** Get auth headers for non-fetch usage */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Called on 401 — redirect to login or show auth UI */
  onUnauthorized(): void;
  /** Navigate to a document (platform-specific routing) */
  navigateToDocument(documentId: string): void;
  /** Navigate to document list */
  navigateToHome(): void;
  /** Optional custom WebSocket constructor for environments where native WS doesn't work (e.g. Expo DOM) */
  getWebSocketPolyfill?(): unknown;
  /** Get the current user's display name (for personalized sharing) */
  getCurrentUserDisplayName?(): string | null;
}

/**
 * Typed API client derived from a DocsAdapter.
 * Used by Zustand stores which can't call React hooks.
 */
export interface DocsApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

/**
 * Create a DocsApiClient from a DocsAdapter.
 */
export function createDocsApiClient(adapter: DocsAdapter): DocsApiClient {
  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${adapter.getApiBaseUrl()}${endpoint}`;

    const isRename = options.method === 'PUT' && endpoint.startsWith('/docs/');
    if (isRename) {
      console.log(
        '[docs-rename] apiClient request: %s %s, body=%s',
        options.method,
        url,
        options.body
      );
    }

    const response = await adapter.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      if (isRename) console.error('[docs-rename] apiClient: 401 Unauthorized for %s', url);
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
      if (isRename) {
        console.error(
          '[docs-rename] apiClient: HTTP %d for %s, error=%o',
          response.status,
          url,
          errorData
        );
      }
      throw new Error(errorData.message || errorData.error || 'Request failed');
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }

    if (isRename) {
      console.warn(
        '[docs-rename] apiClient: non-JSON response for %s, content-type=%s',
        url,
        contentType
      );
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
    put: <T,>(endpoint: string, data?: unknown) =>
      request<T>(endpoint, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
      }),
    delete: <T,>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  };
}

const DocsAdapterContext = createContext<DocsAdapter | null>(null);

export function DocsProvider({ adapter, children }: { adapter: DocsAdapter; children: ReactNode }) {
  return <DocsAdapterContext.Provider value={adapter}>{children}</DocsAdapterContext.Provider>;
}

export function useDocsAdapter(): DocsAdapter {
  const adapter = useContext(DocsAdapterContext);
  if (!adapter) {
    throw new Error('useDocsAdapter must be used within a DocsProvider');
  }
  return adapter;
}
