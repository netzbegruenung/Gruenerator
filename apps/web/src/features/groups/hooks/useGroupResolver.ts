/**
 * Resolve a Notion-style group slug (or raw UUID) to its canonical id.
 *
 * Used by GruppenPage to translate pretty URLs like `/gruppen/mein-team-Ab3xK9`
 * into the UUID that GroupDetailSection and the group hooks already consume. The
 * lookup only fires for inputs that look like a slug and aren't a raw UUID —
 * UUID URLs skip the network round-trip entirely.
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export function useGroupResolver(slugOrId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['group', 'resolve', slugOrId],
    enabled,
    retry: false,
    queryFn: async (): Promise<{ id: string } | null> => {
      const client = getContractsClient();
      const result = await client.groups.resolveGroup({ params: { slugOrId } });
      if (result.status === 200) return { id: result.body.id };
      if (result.status === 404) return null;
      throw new Error(`Failed to resolve group (HTTP ${result.status})`);
    },
  });
}
