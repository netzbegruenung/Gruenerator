import axios from 'axios';

// Use relative URL by default (same as AUTH_BASE_URL in useAuth.js)
// This works because frontend is served by backend on same port
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 900000,
  headers: { 'Content-Type': 'application/json' },
  // Include cookies for session-based authentication
  withCredentials: true
});

// Request interceptor for debugging and header setup
apiClient.interceptors.request.use(
  (config) => {
    // Session-based auth uses cookies automatically with withCredentials: true
    // No need to manually add Authorization headers
    return config;
  },
  error => {
    console.error('[apiClient Interceptor] Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // Redirect to frontend login page instead of backend auth endpoint
      if (window.location.pathname !== '/login') {
        // Store current path for redirect after login
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('redirectAfterLogin', currentPath);
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
    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post(endpoint, cleanFormData),
      0,
      onRetry
    );

    const responseData = response.data;
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