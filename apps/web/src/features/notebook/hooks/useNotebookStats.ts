import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export interface FacetBucket {
  value: string;
  count: number;
}

export interface MonthBucket {
  month: string;
  count: number;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface NotebookStats {
  totalDocuments: number;
  categoryDistribution: FacetBucket[];
  sourceDistribution: FacetBucket[];
  dateRange: { min: string | null; max: string | null };
  monthlyActivity: MonthBucket[];
  topWords: Array<{ word: string; count: number }>;
  topicDistribution: TopicCount[];
  topicSampleSize: number;
}

interface UseNotebookStatsOptions {
  collectionIds: string[];
  enabled?: boolean;
}

// Server-side Redis cache (24h TTL) may serve a payload from before a schema
// addition, where new fields are undefined. We coerce defaults here so consumers
// can safely access `.length` etc. without per-call ?? guards.
function withDefaults(data: Partial<NotebookStats>): NotebookStats {
  return {
    totalDocuments: data.totalDocuments ?? 0,
    categoryDistribution: data.categoryDistribution ?? [],
    sourceDistribution: data.sourceDistribution ?? [],
    dateRange: data.dateRange ?? { min: null, max: null },
    monthlyActivity: data.monthlyActivity ?? [],
    topWords: data.topWords ?? [],
    topicDistribution: data.topicDistribution ?? [],
    topicSampleSize: data.topicSampleSize ?? 0,
  };
}

async function fetchStats(collectionIds: string[]): Promise<NotebookStats> {
  if (collectionIds.length === 1) {
    const { data } = await apiClient.get<Partial<NotebookStats>>(
      `/auth/notebook/collections/${encodeURIComponent(collectionIds[0])}/stats`
    );
    return withDefaults(data);
  }

  const { data } = await apiClient.get<Partial<NotebookStats>>('/auth/notebook/stats', {
    params: { collections: collectionIds.join(',') },
  });
  return withDefaults(data);
}

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
