import { type NotebookOverviewResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type NotebookOverview = NotebookOverviewResponse;

async function fetchOverview(collectionId: string): Promise<NotebookOverview> {
  const result = await getContractsClient().notebook.getCollectionOverview({
    params: { id: collectionId },
    query: { refresh: null },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to load notebook overview (HTTP ${result.status})`);
  }
  return result.body;
}

/**
 * Exact per-notebook statistics — the same endpoint the web Übersicht reads, so
 * both surfaces show identical terms, topics and persons.
 */
export function useNotebookOverview(collectionId: string | null) {
  return useQuery({
    queryKey: ['notebook-overview', collectionId],
    queryFn: () => fetchOverview(collectionId as string),
    enabled: collectionId !== null,
    // The server caches for 12 h; this only spares refetches on tab switches.
    staleTime: 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
  });
}
