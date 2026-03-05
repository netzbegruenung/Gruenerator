import { useState, useCallback } from 'react';

import apiClient from '../../components/utils/apiClient';

import { type SearchMode, type SortOption } from './useResearchFilters';

export interface ResearchResult {
  document_id: string;
  title: string;
  source_url: string | null;
  relevant_content: string;
  similarity_score: number;
  chunk_count: number;
  top_chunks: Array<{
    preview: string;
    chunk_index: number;
    page_number: number | null;
  }>;
  collection_id?: string;
  collection_name?: string;
  published_at?: string | null;
}

interface ResearchResponse {
  results: ResearchResult[];
  metadata: {
    totalResults: number;
    collections: string[];
    timeMs: number;
  };
}

export interface SearchParams {
  query: string;
  collectionIds?: string[];
  filters?: Record<string, unknown>;
  mode?: SearchMode;
  sortBy?: SortOption;
}

interface UseResearchReturn {
  results: ResearchResult[];
  metadata: ResearchResponse['metadata'] | null;
  isLoading: boolean;
  error: string | null;
  search: (params: SearchParams) => Promise<void>;
}

export function useResearch(): UseResearchReturn {
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchResponse['metadata'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (params: SearchParams) => {
    const { query, collectionIds, filters, mode, sortBy } = params;
    if (!query || query.trim().length < 2) return;

    setIsLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { query: query.trim() };
      if (collectionIds?.length) body.collectionIds = collectionIds;
      if (filters) body.filters = filters;
      if (mode && mode !== 'hybrid') body.mode = mode;
      if (sortBy && sortBy !== 'relevance') body.sortBy = sortBy;

      const response = await apiClient.post<ResearchResponse>('/research/search', body);

      setResults(response.data.results);
      setMetadata(response.data.metadata);
    } catch (err: any) {
      const message = err.response?.data?.error || 'Suche fehlgeschlagen. Bitte erneut versuchen.';
      setError(message);
      setResults([]);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { results, metadata, isLoading, error, search };
}
