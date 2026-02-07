import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Axios API client for direct API calls
 */
export const apiClient = axios.create({
  baseURL,
  timeout: 30000,
  withCredentials: true, // Send cookies for session-based auth
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Response interceptor for handling auth errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
    }
    return Promise.reject(error);
  }
);

/**
 * Initialize shared API client for @gruenerator/shared hooks
 */
const sharedClient = createApiClient({
  baseURL,
  authMode: 'cookie',
  onUnauthorized: () => {
    const currentPath = window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
  },
});

setGlobalApiClient(sharedClient);

export default apiClient;
