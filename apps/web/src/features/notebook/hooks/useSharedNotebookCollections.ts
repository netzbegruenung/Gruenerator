import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import { shouldRetryQuery } from '../../../components/utils/queryRetry';

import type { NotebookCollection } from '../../../types/notebook';

const QUERY_KEY = ['notebookCollections', 'shared'] as const;

async function fetchSharedNotebookCollections(): Promise<NotebookCollection[]> {
  const res = await getContractsClient().notebookCollections.listSharedCollections();
  if (res.status !== 200) {
    throw new ApiError(res.status, 'Failed to fetch shared notebook collections');
  }
  if (!res.body.success) {
    throw new Error('Failed to fetch shared notebook collections');
  }
  return res.body.collections;
}

/** Notebooks others shared into a Projekt the user belongs to („Mit dir geteilt"). */
export function useSharedNotebookCollections({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<NotebookCollection[], Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchSharedNotebookCollections,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 1),
  });
}
