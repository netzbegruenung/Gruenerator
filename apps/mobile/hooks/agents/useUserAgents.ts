import { type Agent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Read-only mirror of web's useUserAgents (apps/web/src/features/agents/api.ts).
// Mobile only needs to discover and chat with user agents — creation/editing
// stays web-only — so the mutation hooks are intentionally omitted.
const KEY = ['user-agents'] as const;

export function useUserAgents() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Agent[]> => {
      const res = await getContractsClient().userAgents.list();
      if (res.status === 200) return res.body.agents;
      throw new Error('Agent*innen konnten nicht geladen werden.');
    },
  });
}
