import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export interface RecentDocumentCard {
  id: string;
  collectionId: string;
  collectionName: string;
  title: string;
  snippet: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceLabel: string | null;
}

interface RecentResponse {
  items: RecentDocumentCard[];
  collectionId?: string;
}

interface UseLastAddedOptions {
  collectionIds: string[];
  limit?: number;
  enabled?: boolean;
}

async function fetchRecent(collectionIds: string[], limit: number): Promise<RecentDocumentCard[]> {
  if (collectionIds.length === 0) return [];

  if (collectionIds.length === 1) {
    const id = collectionIds[0];
    const { data } = await apiClient.get<RecentResponse>(
      `/auth/notebook/collections/${encodeURIComponent(id)}/recent`,
      { params: { limit } }
    );
    return data.items ?? [];
  }

  const { data } = await apiClient.get<RecentResponse>('/auth/notebook/recent', {
    params: { collections: collectionIds.join(','), limit },
  });
  return data.items ?? [];
}

export function useLastAddedDocuments({
  collectionIds,
  limit = 6,
  enabled = true,
}: UseLastAddedOptions) {
  const key = [...collectionIds].sort().join('|');
  return useQuery({
    queryKey: ['notebook-recent', key, limit],
    queryFn: () => fetchRecent(collectionIds, limit),
    enabled: enabled && collectionIds.length > 0,
    // Landesverband scrapers run hourly, so 5min keeps "Zuletzt hinzugefügt"
    // close to the live ingest cadence without hammering Qdrant.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
