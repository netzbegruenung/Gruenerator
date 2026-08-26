import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchAdminAgents, setAgentHidden } from '../../../hooks/useAdminAgentsTyped';

export interface AdminAgent {
  identifier: string;
  title: string;
  slug: string | null;
  hidden: boolean;
}

export function useAdminAgents(enabled = true) {
  return useQuery<AdminAgent[]>({
    queryKey: ['admin-agents'],
    queryFn: () => fetchAdminAgents() as Promise<AdminAgent[]>,
    staleTime: 30_000,
    enabled,
  });
}

export function useSetAgentHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, hidden }: { identifier: string; hidden: boolean }) =>
      setAgentHidden(identifier, hidden),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
      // Der öffentliche Endpunkt, aus dem jede Entdeckungsfläche liest —
      // ungültig machen, damit ein Schalter hier ohne Neuladen ankommt.
      void qc.invalidateQueries({ queryKey: ['admin-hidden-agents'] });
    },
  });
}
