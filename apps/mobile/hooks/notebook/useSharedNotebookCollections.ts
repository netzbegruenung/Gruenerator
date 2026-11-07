import { type TransformedCollection } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Dieselbe Abfrage und derselbe Key wie `apps/web/src/features/notebook/hooks/useSharedNotebookCollections.ts`.
const QUERY_KEY = ['notebookCollections', 'shared'] as const;

async function fetchSharedNotebookCollections(): Promise<TransformedCollection[]> {
  const res = await getContractsClient().notebookCollections.listSharedCollections();
  if (res.status !== 200) {
    throw new ApiError(res.status, 'Failed to fetch shared notebook collections');
  }
  if (!res.body.success) {
    throw new Error('Failed to fetch shared notebook collections');
  }
  return res.body.collections;
}

/** Notebooks, die andere in ein Projekt der Person geteilt haben („Mit dir geteilt"). */
export function useSharedNotebookCollections({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<TransformedCollection[], Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchSharedNotebookCollections,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
