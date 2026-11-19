import { type DriveProvider } from '@gruenerator/contracts';
import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { openConnectPopup, unwrap } from '@/features/admin/connector-test/connectorTestApi';

// Dieselbe Abfrage wie der @connect-Picker im Chat (`/api/connections/status`).
const STATUS_KEY = ['connections-status'];

interface ConnectionsStatus {
  providers?: { provider: string; connected: boolean }[];
}

/**
 * A Nango drive (Microsoft 365, Google Workspace) as a card in the connector
 * directory. Both are open to everyone and marked experimental in the card
 * (Microsoft since 16.11.2026, Google since 19.11.2026). Status and disconnect
 * use the existing `/api/connections` routes the chat's @connect picker reads;
 * the connect link comes from `connections.connectLink`.
 */
export function useNangoConnector(provider: DriveProvider) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () =>
      (await getGlobalApiClient().get<ConnectionsStatus>('/connections/status')).data,
  });
  const connect = useMutation({
    mutationFn: () =>
      openConnectPopup(
        async () =>
          unwrap(await getContractsClient().connections.connectLink({ params: { provider } }))
            .connectLink
      ),
    onSettled: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => getGlobalApiClient().delete(`/connections/${provider}`),
    onSettled: refresh,
  });

  const entry = status.data?.providers?.find((p) => p.provider === provider);
  return {
    /** False until the status answered; the card then shows „Verbinden". */
    available: entry !== undefined,
    connected: entry?.connected === true,
    connect,
    disconnect,
  };
}
