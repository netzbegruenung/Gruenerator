import axios from 'axios';
import { supabase } from './supabaseClient';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://gruenerator.de/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 900000,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      if (supabase) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[apiClient Interceptor] Error getting Supabase session:', sessionError);
        } else if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        } else {
          delete config.headers.Authorization;
        }
      } else {
        console.warn('[apiClient Interceptor] Supabase client not initialized. Cannot attach auth token.');
        delete config.headers.Authorization;
      }
    } catch (e) {
      console.error('[apiClient Interceptor] Unexpected error getting session:', e);
    }

    return config;
  },
  error => {
    console.error('[apiClient Interceptor] Request Error:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      console.warn('[apiClient Interceptor] Received 401 Unauthorized. Redirecting to login.');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

async function retryWithExponentialBackoff(operation, retryCount = 0, onRetry) {
  try {
    return await operation();
  } catch (error) {
    if ((error.response?.status === 503 || error.response?.status === 529 || error.response?.status === 429) && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;
      
      if (onRetry) {
        onRetry(retryCount + 1, totalDelay, error);
      }
      
      console.warn(`[apiClient] Request failed (Status: ${error.response.status}). Retrying in ${Math.round(totalDelay / 1000)}s... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return retryWithExponentialBackoff(operation, retryCount + 1, onRetry);
    }
    throw error;
  }
}

export const uploadFileAndGetText = async (endpoint, file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadResponse = await apiClient.post(`${endpoint}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return uploadResponse.data.text;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const processText = async (endpoint, formData) => {
  try {
    console.log('[apiClient] Sending request:', {
      endpoint,
      useBackupProvider: formData.useBackupProvider,
      useEuropaProvider: formData.useEuropaProvider,
      hasSystemPrompt: !!formData.systemPrompt,
      type: formData.type,
      payloadKeys: Object.keys(formData).filter(k => k !== 'onRetry')
    });

    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post(endpoint, cleanFormData),
      0,
      onRetry
    );

    const responseData = response.data;
    console.log('[apiClient] Raw Response Status:', response.status);
    console.log('[apiClient] Response Data Keys:', responseData ? Object.keys(responseData) : 'No data');
    if (responseData?.metadata) {
      console.log('[apiClient] Response Metadata:', responseData.metadata);
    }

    return responseData;
  } catch (error) {
    console.error('[apiClient] Error processing request:', {
      message: error.message,
      name: error.name,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
    });
    handleApiError(error);
    throw error;
  }
};

const handleApiError = (error) => {
  if (error.response) {
    const { status, data, config } = error.response;

    console.error('API Server Error:', {
      status,
      data,
      url: config?.url,
      method: config?.method
    });

    if (typeof data === 'object' && data !== null && data.message) {
      const friendlyError = new Error(data.message || `Serverfehler (Status ${status})`);
      friendlyError.name = data.errorType || 'ServerError';
      friendlyError.originalError = error;
      friendlyError.errorId = data.errorId;
      friendlyError.timestamp = data.timestamp;
      friendlyError.errorCode = data.errorCode;
      friendlyError.details = data.details;

      throw friendlyError;
    } else {
      const genericError = new Error(`Anfrage fehlgeschlagen mit Status ${status}`);
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

    const networkError = new Error('Keine Antwort vom Server erhalten. Bitte Netzwerk prüfen.');
    networkError.name = 'NetworkError';
    networkError.originalError = error;
    throw networkError;
  } else {
    console.error('Request Setup Error:', {
      message: error.message,
      stack: error.stack
    });

    const requestSetupError = new Error('Fehler beim Erstellen der Anfrage: ' + error.message);
    requestSetupError.name = 'RequestSetupError';
    requestSetupError.originalError = error;
    throw requestSetupError;
  }
};

export default apiClient;