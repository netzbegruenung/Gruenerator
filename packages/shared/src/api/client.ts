import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiConfig } from '../types/auth.js';

export type AuthMode = 'cookie' | 'bearer';

/**
 * Per-request config extension. Set `skipAuthRefresh: true` to exempt a request
 * from the global 401 handler — used by the session re-probe inside
 * `onUnauthorized` so the probe can't re-enter the interceptor and recurse.
 */
export type AuthRequestConfig = AxiosRequestConfig & { skipAuthRefresh?: boolean };

export interface CreateApiClientOptions extends ApiConfig {
  authMode: AuthMode;
  timeout?: number;
}

/**
 * Creates a platform-agnostic API client
 *
 * Web: Uses cookie-based auth (credentials: 'include')
 * Mobile: Uses Bearer token auth
 */
export function createApiClient(options: CreateApiClientOptions): AxiosInstance {
  const {
    baseURL,
    authMode,
    getAuthToken,
    onUnauthorized,
    onTokenRefresh,
    timeout = 900000,
  } = options;

  const client = axios.create({
    baseURL,
    timeout,
    withCredentials: authMode === 'cookie',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - add auth token for bearer mode
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if (authMode === 'bearer' && getAuthToken) {
      const token = await getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  // Response interceptor - handle 401 errors with retry after token refresh
  client.interceptors.response.use(
    (response) => {
      // Better Auth's bearer() plugin can return a refreshed session token via
      // the `set-auth-token` response header. Persist it so the stored token
      // never drifts from the server session. No-op on web (no handler passed).
      if (onTokenRefresh) {
        const refreshedToken: unknown = response.headers['set-auth-token'];
        if (typeof refreshedToken === 'string' && refreshedToken.length > 0) {
          void onTokenRefresh(refreshedToken);
        }
      }
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as
        | (InternalAxiosRequestConfig & { _retried?: boolean; skipAuthRefresh?: boolean })
        | undefined;
      if (
        error.response?.status === 401 &&
        onUnauthorized &&
        originalRequest &&
        !originalRequest._retried &&
        !originalRequest.skipAuthRefresh
      ) {
        originalRequest._retried = true;
        // Pass 401 context so the handler can log which endpoint/request failed
        // (session-debug correlation). The backend puts `code`/`requestId` in the
        // 401 body and mirrors the id to the `X-Request-Id` header.
        const errorBody = error.response.data as { code?: string; requestId?: string } | undefined;
        const requestIdHeader = error.response.headers?.['x-request-id'];
        const info = {
          url: originalRequest.url,
          method: originalRequest.method,
          status: 401,
          code: errorBody?.code,
          requestId:
            errorBody?.requestId ??
            (typeof requestIdHeader === 'string' ? requestIdHeader : undefined),
        };
        // onUnauthorized is `(info?) => void | Promise<boolean>`; awaiting the
        // optional Promise variant is intentional (we act on the refreshed
        // result). The `void` member of the union makes await-thenable flag it.
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const refreshed = await onUnauthorized(info);
        if (refreshed) {
          if (authMode === 'bearer' && getAuthToken) {
            const token = await getAuthToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
          }
          return client.request(originalRequest);
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

// Global API client instance - set by platform-specific code
let globalApiClient: AxiosInstance | null = null;

export const setGlobalApiClient = (client: AxiosInstance): void => {
  globalApiClient = client;
};

export const getGlobalApiClient = (): AxiosInstance => {
  if (!globalApiClient) {
    throw new Error('API client not initialized. Call setGlobalApiClient first.');
  }
  return globalApiClient;
};

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Helper for common API patterns
 */
export async function apiRequest<T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  data?: unknown
): Promise<T> {
  const client = getGlobalApiClient();
  const response = await client.request<T>({
    method,
    url,
    data,
  });
  return response.data;
}
