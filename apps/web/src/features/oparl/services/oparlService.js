import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const searchCity = async (query) => {
  const response = await apiClient.get('/oparl/search-city', {
    params: { q: query },
  });
  return response.data;
};

export const getEndpoints = async () => {
  const response = await apiClient.get('/oparl/endpoints');
  return response.data;
};

export const getPapers = async (city, limit = 50) => {
  const response = await apiClient.get('/oparl/papers', {
    params: { city, limit },
  });
  return response.data;
};

export const searchPapers = async (query, options = {}) => {
  const { city, limit = 10 } = options;
  const response = await apiClient.get('/oparl/search', {
    params: { q: query, city, limit },
  });
  return response.data;
};

export const getIndexedCities = async () => {
  const response = await apiClient.get('/oparl/indexed-cities');
  return response.data;
};

export const getStats = async () => {
  const response = await apiClient.get('/oparl/stats');
  return response.data;
};

export default {
  searchCity,
  getEndpoints,
  getPapers,
  searchPapers,
  getIndexedCities,
  getStats,
};
