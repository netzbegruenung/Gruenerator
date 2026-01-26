import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const apiClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname + window.location.search;
      const loginUrl = `/api/auth/login?source=gruenerator-login&redirectTo=${encodeURIComponent(currentPath)}`;
      window.location.href = loginUrl;
    }
    return Promise.reject(error);
  }
);

// Initialize the global API client for shared package hooks
const sharedClient = createApiClient({
  baseURL,
  authMode: 'cookie',
  onUnauthorized: () => {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/login?source=gruenerator-login&redirectTo=${encodeURIComponent(currentPath)}`;
  },
  timeout: 30000,
});
setGlobalApiClient(sharedClient);

export default apiClient;
