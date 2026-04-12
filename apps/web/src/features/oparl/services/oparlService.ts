import axios from 'axios';

import type { OparlPaper } from '../types';

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export interface OparlCity {
  name: string;
  city: string;
  [key: string]: unknown;
}

export type { OparlPaper };
export interface OparlFaction {
  [key: string]: unknown;
}
export interface OparlBodyInfo {
  [key: string]: unknown;
}

interface SearchCityResponse {
  results: OparlCity[];
}

interface GetPapersResponse {
  papers: OparlPaper[];
  greenFactions: OparlFaction[];
  body: OparlBodyInfo | null;
  totalAvailable: number;
}

interface OparlStats {
  [key: string]: unknown;
}

export const searchCity = async (query: string): Promise<SearchCityResponse> => {
  const response = await apiClient.get<SearchCityResponse>('/oparl/search-city', {
    params: { q: query },
  });
  return response.data;
};

export const getEndpoints = async (): Promise<unknown[]> => {
  const response = await apiClient.get<unknown[]>('/oparl/endpoints');
  return response.data;
};

export const getPapers = async (city: string, limit: number = 50): Promise<GetPapersResponse> => {
  const response = await apiClient.get<GetPapersResponse>('/oparl/papers', {
    params: { city, limit },
  });
  return response.data;
};

export interface SearchResult {
  results: OparlPaper[];
  total: number;
}

export interface IndexedCitiesResult {
  cities: string[];
}

export const searchPapers = async (
  query: string,
  options: { city?: string; limit?: number } = {}
): Promise<SearchResult> => {
  const { city, limit = 10 } = options;
  const response = await apiClient.get<SearchResult>('/oparl/search', {
    params: { q: query, city, limit },
  });
  return response.data;
};

export const getIndexedCities = async (): Promise<IndexedCitiesResult> => {
  const response = await apiClient.get<IndexedCitiesResult>('/oparl/indexed-cities');
  return response.data;
};

export const getStats = async (): Promise<OparlStats> => {
  const response = await apiClient.get<OparlStats>('/oparl/stats');
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
