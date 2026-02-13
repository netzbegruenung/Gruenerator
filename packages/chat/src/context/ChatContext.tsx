/**
 * Chat API client with hardcoded web auth (cookie-based).
 *
 * Since chat is only served through apps/web (and apps/desktop wraps web),
 * we use a simple module-level singleton instead of a React Context adapter.
 */

export interface ChatApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  patch<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

export function chatFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, credentials: 'include' });
}

function onUnauthorized(): void {
  if (window.location.pathname === '/login') return;
  const currentPath = window.location.pathname + window.location.search;
  window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await chatFetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    onUnauthorized();
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

export const chatApiClient: ChatApiClient = {
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
