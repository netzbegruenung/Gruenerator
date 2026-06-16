import { type NotebookRecentDocumentCard } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type RecentDocumentCard = NotebookRecentDocumentCard;

interface UseLastAddedOptions {
  collectionIds: string[];
  limit?: number;
  enabled?: boolean;
}

async function fetchRecent(collectionIds: string[], limit: number): Promise<RecentDocumentCard[]> {
  if (collectionIds.length === 0) return [];

  const client = getContractsClient();

  if (collectionIds.length === 1) {
    const result = await client.notebook.getCollectionRecent({
      params: { id: collectionIds[0] },
      query: { limit: String(limit) },
    });
    if (result.status !== 200) {
      throw new Error(`Failed to load recent documents (HTTP ${result.status})`);
    }
    return result.body.items;
  }

  const result = await client.notebook.getRecent({
    query: { collections: collectionIds.join(','), limit: String(limit) },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to load recent documents (HTTP ${result.status})`);
  }
  return result.body.items;
}

/**
 * Most-recently-added documents across a notebook's collections. Mirrors the web
 * hook 1:1 so mobile's "Zuletzt hinzugefügt" section matches the web notebook page.
 */
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
