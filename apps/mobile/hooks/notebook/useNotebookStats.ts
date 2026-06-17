import { type NotebookStatsResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type NotebookStats = NotebookStatsResponse;
export type FacetBucket = NotebookStats['categoryDistribution'][number];
export type TopicCount = NotebookStats['topicDistribution'][number];

interface UseNotebookStatsOptions {
  collectionIds: string[];
  enabled?: boolean;
}

async function fetchStats(collectionIds: string[]): Promise<NotebookStats> {
  const client = getContractsClient();

  if (collectionIds.length === 1) {
    const result = await client.notebook.getCollectionStats({
      params: { id: collectionIds[0] },
      query: { refresh: null },
    });
    if (result.status !== 200) {
      throw new Error(`Failed to load notebook stats (HTTP ${result.status})`);
    }
    return result.body;
  }

  const result = await client.notebook.getStats({
    query: { collections: collectionIds.join(','), refresh: null },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to load notebook stats (HTTP ${result.status})`);
  }
  return result.body;
}

/**
 * Per-notebook document statistics (counts, date range, topic distribution, top
 * terms/persons). Mirrors the web hook 1:1 — same contracted endpoints, same
 * caching intent — so the mobile StatisticsSection renders the identical data.
 */
export function useNotebookStats({ collectionIds, enabled = true }: UseNotebookStatsOptions) {
  const key = [...collectionIds].sort().join('|');
  return useQuery({
    queryKey: ['notebook-stats', key],
    queryFn: () => fetchStats(collectionIds),
    enabled: enabled && collectionIds.length > 0,
    // Stats are derived from Qdrant aggregates + a once-per-month NLP snapshot,
    // so they barely shift hour-to-hour. Server-side Redis already caches for
    // 24h; this client cache mainly avoids refetch on tab switches.
    staleTime: 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
  });
}
