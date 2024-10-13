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
    const response = await apiClient.post(endpoint, formData);
    return response.data;
  } catch (error) {
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