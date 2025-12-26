import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiConfig } from '../types/auth';

export type AuthMode = 'cookie' | 'bearer';

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
  const { baseURL, authMode, getAuthToken, onUnauthorized, timeout = 900000 } = options;

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

  // Response interceptor - handle 401 errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401 && onUnauthorized) {
        onUnauthorized();
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
