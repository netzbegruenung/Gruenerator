import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

import { buildLoginUrl, isPublicPage } from '../../utils/authRedirect';
import { getDesktopToken } from '../../utils/desktopAuth';
import { isDesktopApp } from '../../utils/platform';

// Use relative URL by default (same as AUTH_BASE_URL in useAuth.js)
// This works because frontend is served by backend on same port
const baseURL: string = import.meta.env.VITE_API_BASE_URL || '/api';

// Initialize global API client for @gruenerator/shared hooks (useShareStore, etc.)
// This is separate from the legacy apiClient below, but uses the same baseURL
const sharedApiClient = createApiClient({
  baseURL,
  authMode: isDesktopApp() ? 'bearer' : 'cookie',
  getAuthToken: isDesktopApp() ? async () => getDesktopToken() : undefined,
  onUnauthorized: () => {
    if (!isPublicPage() && window.location.pathname !== '/login') {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = buildLoginUrl(currentPath);
    }
  },
  timeout: 900000,
});
setGlobalApiClient(sharedApiClient);

// Detect browser locale and map to a supported locale for unauthenticated requests
function detectBrowserLocale(): string {
  const languages = navigator.languages || [navigator.language];
  for (const lang of languages) {
    if (lang.startsWith('de-AT')) return 'de-AT';
  }
  return 'de-DE';
}

// Desktop app uses JWT tokens, web app uses session cookies
// withCredentials must be false for desktop to avoid "Refused to set unsafe header Origin" error
const useCredentials: boolean = !isDesktopApp();

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 900000,
  headers: {
    'Content-Type': 'application/json',
    'X-User-Locale': detectBrowserLocale(),
  },
  withCredentials: useCredentials,
});

// Request interceptor for debugging and header setup
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    // Desktop app uses JWT token from localStorage
    if (isDesktopApp()) {
      const token = await getDesktopToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // Web app uses session cookies automatically with withCredentials: true
    return config;
  },
  (error: AxiosError) => {
    console.error('[apiClient Interceptor] Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Check if this request should skip auth redirect
    if (error.config?.skipAuthRedirect) {
      return Promise.reject(error);
    }

    if (error.response && error.response.status === 401) {
      if (!isPublicPage() && window.location.pathname !== '/login') {
        const currentPath = window.location.pathname + window.location.search;
        const loginUrl = buildLoginUrl(currentPath);
        window.location.href = loginUrl;
      }
    }
    return Promise.reject(error);
  }
);

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

type RetryOnCallback = (retryCount: number, delay: number, error: AxiosError) => void;

async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  retryCount: number = 0,
  onRetry?: RetryOnCallback
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const axiosError = error as AxiosError;
    if (
      (axiosError.response?.status === 503 ||
        axiosError.response?.status === 529 ||
        axiosError.response?.status === 429) &&
      retryCount < MAX_RETRIES
    ) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      if (onRetry) {
        onRetry(retryCount + 1, totalDelay, axiosError);
      }

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
      return retryWithExponentialBackoff(operation, retryCount + 1, onRetry);
    }
    throw error;
  }
}

export const uploadFileAndGetText = async (endpoint: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadResponse = await apiClient.post(`${endpoint}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return uploadResponse.data.text;
  } catch (error) {
    handleApiError(error as AxiosError);
    throw error;
  }
};

interface ProcessTextFormData {
  onRetry?: RetryOnCallback;
  [key: string]: unknown;
}

export const processText = async (
  endpoint: string,
  formData: ProcessTextFormData
): Promise<unknown> => {
  try {
    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post(endpoint, cleanFormData),
      0,
      onRetry
    );

    const responseData = response.data;
    return responseData;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('[apiClient] Error processing request:', {
      message: axiosError.message,
      name: axiosError.name,
      code: axiosError.code,
      status: axiosError.response?.status,
      responseData: axiosError.response?.data,
      requestUrl: axiosError.config?.url,
      requestMethod: axiosError.config?.method,
    });
    handleApiError(axiosError);
    throw error;
  }
};

interface ApiErrorData {
  message?: string;
  errorType?: string;
  errorId?: string;
  timestamp?: string;
  errorCode?: string;
  details?: unknown;
}

interface ApiError extends Error {
  originalError?: AxiosError;
  errorId?: string;
  timestamp?: string;
  errorCode?: string;
  details?: unknown;
  status?: number;
}

const handleApiError = (error: AxiosError): never => {
  if (error.response) {
    const { status, data, config } = error.response;

    console.error('API Server Error:', {
      status,
      data,
      url: config?.url,
      method: config?.method,
    });

    const errorData = data as ApiErrorData | null;
    if (typeof errorData === 'object' && errorData !== null && errorData.message) {
      const friendlyError: ApiError = new Error(
        errorData.message || `Serverfehler (Status ${status})`
      );
      friendlyError.name = errorData.errorType || 'ServerError';
      friendlyError.originalError = error;
      friendlyError.errorId = errorData.errorId;
      friendlyError.timestamp = errorData.timestamp;
      friendlyError.errorCode = errorData.errorCode;
      friendlyError.details = errorData.details;

      throw friendlyError;
    } else {
      const genericError: ApiError = new Error(`Anfrage fehlgeschlagen mit Status ${status}`);
      genericError.name = 'HttpError';
      genericError.status = status;
      genericError.originalError = error;
      throw genericError;
    }
  } else if (error.request) {
    console.error('Network Error / No Response:', {
      message: error.message,
      requestDetails: error.request,
    });

    const networkError: ApiError = new Error(
      'Keine Antwort vom Server erhalten. Bitte Netzwerk prüfen.'
    );
    networkError.name = 'NetworkError';
    networkError.originalError = error;
    throw networkError;
  } else {
    console.error('Request Setup Error:', {
      message: error.message,
      stack: error.stack,
    });

    const requestSetupError: ApiError = new Error(
      'Fehler beim Erstellen der Anfrage: ' + error.message
    );
    requestSetupError.name = 'RequestSetupError';
    requestSetupError.originalError = error;
    throw requestSetupError;
  }
};

export default apiClient;
