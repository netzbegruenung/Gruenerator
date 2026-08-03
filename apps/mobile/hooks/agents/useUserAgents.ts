import { type Agent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Read-only mirror of web's useUserAgents (apps/web/src/features/agents/api.ts).
// Mobile only needs to discover and chat with user agents — creation/editing
// stays web-only — so the mutation hooks are intentionally omitted.
const KEY = ['user-agents'] as const;

/**
 * `enabled` exists for the chat screen: it only needs this list to name a user's
 * own Grünerator in the header, and a chat opened with a system agent — or with
 * none — should not fire the request at all.
 */
export function useUserAgents(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<Agent[]> => {
      const res = await getContractsClient().userAgents.list();
      if (res.status === 200) return res.body.agents;
      throw new Error('Deine Grüneratoren konnten nicht geladen werden.');
    },
  });
}
