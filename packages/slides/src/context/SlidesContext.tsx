import { createContext, useContext, type ReactNode } from 'react';

/**
 * Platform-agnostic interface for slides API communication.
 *
 * Each consumer (Vite web, Tauri desktop, Expo mobile)
 * provides its own adapter implementation.
 *
 * Mirrors DocsAdapter from @gruenerator/docs.
 */
export interface SlidesAdapter {
  /** Perform a fetch request with appropriate auth (cookies, bearer, etc.) */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Base URL for the API (e.g. 'https://api.gruenerator.de' or '') */
  getApiBaseUrl(): string;
  /** Get auth headers for non-fetch usage */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Called on 401 — redirect to login or show auth UI */
  onUnauthorized(): void;
  /** Navigate to a presentation (platform-specific routing) */
  navigateToPresentation(presentationId: string): void;
  /** Navigate to presentation list */
  navigateToHome(): void;
  /** Get the current user's display name */
  getCurrentUserDisplayName?(): string | null;
}

/**
 * Typed API client derived from a SlidesAdapter.
 * Used by Zustand stores which can't call React hooks.
 */
export interface SlidesApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
  /** Fetch raw binary (for PPTX/PDF downloads) */
  getBlob(url: string): Promise<Blob>;
}

/**
 * Create a SlidesApiClient from a SlidesAdapter.
 */
export function createSlidesApiClient(adapter: SlidesAdapter): SlidesApiClient {
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
        body: data ? JSON.stringify(data) : null,
      }),
    put: <T,>(endpoint: string, data?: unknown) =>
      request<T>(endpoint, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : null,
      }),
    delete: <T,>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
    getBlob: async (endpoint: string) => {
      const url = endpoint.startsWith('http') ? endpoint : `${adapter.getApiBaseUrl()}${endpoint}`;
      const response = await adapter.fetch(url);
      if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
      return response.blob();
    },
  };
}

const SlidesAdapterContext = createContext<SlidesAdapter | null>(null);

export function SlidesProvider({
  adapter,
  children,
}: {
  adapter: SlidesAdapter;
  children: ReactNode;
}) {
  return <SlidesAdapterContext.Provider value={adapter}>{children}</SlidesAdapterContext.Provider>;
}

export function useSlidesAdapter(): SlidesAdapter {
  const adapter = useContext(SlidesAdapterContext);
  if (!adapter) {
    throw new Error('useSlidesAdapter must be used within a SlidesProvider');
  }
  return adapter;
}
