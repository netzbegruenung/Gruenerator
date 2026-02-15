import { useState, useCallback } from 'react';
import apiClient from '../../components/utils/apiClient';

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
}

interface ResearchResponse {
  results: ResearchResult[];
  metadata: {
    totalResults: number;
    collections: string[];
    timeMs: number;
  };
}

interface UseResearchReturn {
  results: ResearchResult[];
  metadata: ResearchResponse['metadata'] | null;
  isLoading: boolean;
  error: string | null;
  search: (query: string, collectionIds?: string[]) => Promise<void>;
}

export function useResearch(): UseResearchReturn {
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchResponse['metadata'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, collectionIds?: string[]) => {
    if (!query || query.trim().length < 2) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<ResearchResponse>('/research/search', {
        query: query.trim(),
        ...(collectionIds?.length && { collectionIds }),
      });

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
