import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

import type { NotebookCollection, NotebookCollectionsResponse } from '../../../types/notebook';

const QUERY_KEY = ['notebookCollections', 'public'] as const;

async function fetchPublicNotebookCollections(): Promise<NotebookCollection[]> {
  const response = await apiClient.get<NotebookCollectionsResponse>(
    '/auth/notebook-collections/public'
  );
  if (!response.data.success) {
    throw new Error(response.data.message ?? 'Failed to fetch public notebook collections');
  }
  return response.data.collections ?? [];
}

export function usePublicNotebookCollections({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<NotebookCollection[], Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchPublicNotebookCollections,
    enabled,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
