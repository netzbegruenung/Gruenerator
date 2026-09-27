import { type NotebookOverviewResponse } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type NotebookOverview = NotebookOverviewResponse;

async function fetchOverview(collectionId: string): Promise<NotebookOverview> {
  const result = await getContractsClient().notebook.getCollectionOverview({
    params: { id: collectionId },
    query: { refresh: null },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to load notebook overview (HTTP ${result.status})`);
  }
  return result.body;
}

export function useNotebookOverview(collectionId: string) {
  return useQuery({
    queryKey: ['notebook-overview', collectionId],
    queryFn: () => fetchOverview(collectionId),
    // The server caches for 12 h; this only spares refetches on tab switches.
    staleTime: 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
  });
}
