import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import type { NotebookCollection } from '../../../types/notebook';

const QUERY_KEY = ['notebookCollections', 'public'] as const;

async function fetchPublicNotebookCollections(): Promise<NotebookCollection[]> {
  const res = await getContractsClient().notebookCollections.listPublicCollections();
  if (res.status !== 200 || !res.body.success) {
    throw new Error('Failed to fetch public notebook collections');
  }
  // The contract's collection schema and the app's richer NotebookCollection
  // domain type (view_count, public_url_token, …) describe the same wire rows
  // but neither is assignable to the other; unifying them is out of scope for
  // this client-adoption pass.
  return res.body.collections as unknown as NotebookCollection[];
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
