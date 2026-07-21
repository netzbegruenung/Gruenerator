import apiClient from '../../../components/utils/apiClient';

import type { OparlPaper } from '../types';

// Use the shared probe-aware client (session probe + atomic teardown on 401)
// instead of a standalone axios instance that had no 401 handling at all.
// Its default timeout is 900s, so each oparl call re-asserts the old 30s cap.
const OPARL_TIMEOUT = 30_000;

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
    timeout: OPARL_TIMEOUT,
  });
  return response.data;
};

export const getEndpoints = async (): Promise<unknown[]> => {
  const response = await apiClient.get<unknown[]>('/oparl/endpoints', { timeout: OPARL_TIMEOUT });
  return response.data;
};

export const getPapers = async (city: string, limit: number = 50): Promise<GetPapersResponse> => {
  const response = await apiClient.get<GetPapersResponse>('/oparl/papers', {
    params: { city, limit },
    timeout: OPARL_TIMEOUT,
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
    timeout: OPARL_TIMEOUT,
  });
  return response.data;
};

export const getIndexedCities = async (): Promise<IndexedCitiesResult> => {
  const response = await apiClient.get<IndexedCitiesResult>('/oparl/indexed-cities', {
    timeout: OPARL_TIMEOUT,
  });
  return response.data;
};

export const getStats = async (): Promise<OparlStats> => {
  const response = await apiClient.get<OparlStats>('/oparl/stats', { timeout: OPARL_TIMEOUT });
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
