import axios from 'axios';

const baseURL = process.env.REACT_APP_API_BASE_URL || 'https://gruenerator.de/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 40000,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      window.location.href = '/login';
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
    if ((error.response?.status === 529 || error.response?.status === 503) && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;
      
      if (onRetry) {
        onRetry(retryCount + 1, totalDelay);
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
    console.log('[apiClient] Sending request with backup:', formData.useBackupProvider, {
      endpoint,
      useBackupProvider: formData.useBackupProvider,
      hasSystemPrompt: !!formData.systemPrompt,
      type: formData.type
    });

    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post(endpoint, cleanFormData),
      0,
      onRetry
    );

    // Detaillierteres Logging
    const responseData = response.data;
    console.log('[apiClient] Raw Response:', responseData);
    console.log('[apiClient] Response Details:', {
      provider: responseData.metadata?.provider,
      backupRequested: responseData.metadata?.backupRequested,
      hasContent: !!responseData.content,
      timestamp: responseData.metadata?.timestamp
    });

    return responseData;
  } catch (error) {
    console.error('[apiClient] Error processing request:', error);
    handleApiError(error);
    throw error;
  }
};

const handleApiError = (error) => {
  if (error.response) {
    console.error('API Error:', error.response.data);
  } else if (error.request) {
    console.error('No response received:', error.request);
  } else {
    console.error('Error setting up request:', error.message);
  }
};

export default apiClient;