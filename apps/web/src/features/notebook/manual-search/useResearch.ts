import { useState, useCallback } from 'react';

import apiClient from '../../../components/utils/apiClient';

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

export interface UseResearchOptions {
  /**
   * When set, POSTs to /auth/notebook/:id/research-search (user-owned notebook,
   * chunk-level Qdrant search scoped by ownership) instead of /research/search
   * (system-collection endpoint). `collectionIds` and `filters` in SearchParams
   * are ignored in this mode — the path UUID is the scope.
   */
  notebookId?: string;
}

interface UseResearchReturn {
  results: ResearchResult[];
  metadata: ResearchResponse['metadata'] | null;
  isLoading: boolean;
  error: string | null;
  search: (params: SearchParams) => Promise<void>;
  fetchSimilar: (sourceUrl: string, collectionId: string) => Promise<void>;
}

export function useResearch(opts: UseResearchOptions = {}): UseResearchReturn {
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchResponse['metadata'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notebookId = opts.notebookId;

  const search = useCallback(
    async (params: SearchParams) => {
      const { query, collectionIds, filters, mode, sortBy } = params;
      if (!query || query.trim().length < 2) return;

      setIsLoading(true);
      setError(null);

      try {
        const body: Record<string, unknown> = { query: query.trim() };
        if (mode && mode !== 'hybrid') body.mode = mode;
        if (sortBy && sortBy !== 'relevance') body.sortBy = sortBy;

        let url: string;
        if (notebookId) {
          url = `/auth/notebook/${notebookId}/research-search`;
        } else {
          url = '/research/search';
          if (collectionIds?.length) body.collectionIds = collectionIds;
          if (filters) body.filters = filters;
        }

        const response = await apiClient.post<ResearchResponse>(url, body);

        setResults(response.data.results);
        setMetadata(response.data.metadata);
      } catch (err: unknown) {
        const errResp = (err as { response?: { data?: { error?: string } } }).response;
        const message = errResp?.data?.error ?? 'Suche fehlgeschlagen. Bitte erneut versuchen.';
        setError(message);
        setResults([]);
        setMetadata(null);
      } finally {
        setIsLoading(false);
      }
    },
    [notebookId]
  );

  const fetchSimilar = useCallback(async (sourceUrl: string, collectionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<ResearchResponse>('/research/similar', {
        sourceUrl,
        collectionId,
      });

      setResults(response.data.results);
      setMetadata(response.data.metadata);
    } catch (err: unknown) {
      const errResp = (err as { response?: { data?: { error?: string } } }).response;
      const message = errResp?.data?.error ?? 'Ähnliche Dokumente konnten nicht geladen werden.';
      setError(message);
      setResults([]);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { results, metadata, isLoading, error, search, fetchSimilar };
}
