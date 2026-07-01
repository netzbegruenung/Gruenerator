import { type Agent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Read-only mirror of web's usePublicUserAgents (apps/web/src/features/agents/api.ts).
// Public "Von der Basis" agents — listed via the shared `listPublic` endpoint,
// which already locale-filters (de-DE/de-AT) server-side. Mobile only discovers
// and chats with them; creation/editing/sharing stays web-only.
export function usePublicUserAgents() {
  return useQuery({
    queryKey: ['public-user-agents'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Agent[]> => {
      const res = await getContractsClient().userAgentsSharing.listPublic();
      if (res.status === 200) return res.body.agents;
      throw new Error('Öffentliche Agent*innen konnten nicht geladen werden.');
    },
  });
}
