/**
 * Resolve a Notion-style notebook slug (or raw UUID) to its canonical ID.
 *
 * Used by NotebookResolver to translate pretty URLs like
 * `/notebooks/my-research-Ab3xK9` into the UUID downstream components
 * (DynamicNotebookPage, useNotebookSharing) already consume. The lookup
 * only fires for inputs that are neither a system-notebook slug nor a
 * direct UUID — those skip the network round-trip entirely.
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

interface ResolvedNotebook {
  id: string;
  slug_suffix: string;
  name: string;
  share_mode: 'private' | 'groups' | 'authenticated' | null;
}

export function useNotebookResolver(slugOrId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['notebook', 'resolve', slugOrId],
    enabled,
    retry: false,
    queryFn: async (): Promise<ResolvedNotebook | null> => {
      const client = getContractsClient();
      const result = await client.notebookCollections.resolveCollection({
        params: { slugOrId },
      });
      if (result.status === 200) return result.body;
      if (result.status === 404) return null;
      throw new Error(`Failed to resolve notebook (HTTP ${result.status})`);
    },
  });
}
