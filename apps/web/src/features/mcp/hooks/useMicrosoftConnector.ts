import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { openConnectPopup, unwrap } from '@/features/admin/connector-test/connectorTestApi';

// Dieselbe Abfrage wie der @connect-Picker im Chat (`/api/connections/status`).
const STATUS_KEY = ['connections-status'];

interface ConnectionsStatus {
  providers?: { provider: string; connected: boolean }[];
}

/**
 * Microsoft 365 (OneDrive, via Nango) as a card in the connector directory.
 * Open to everyone since 16.11.2026 and marked experimental in the card.
 * Status and disconnect use the existing `/api/connections` routes the chat's
 * @connect picker reads; the connect link comes from `connections.connectLink`.
 */
export function useMicrosoftConnector() {
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
          unwrap(
            await getContractsClient().connections.connectLink({
              params: { provider: 'microsoft' },
            })
          ).connectLink
      ),
    onSettled: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => getGlobalApiClient().delete('/connections/microsoft'),
    onSettled: refresh,
  });

  return {
    /** False until the status answered; the card then shows „Verbinden". */
    available: status.data?.providers?.some((p) => p.provider === 'microsoft') === true,
    connected: status.data?.providers?.find((p) => p.provider === 'microsoft')?.connected === true,
    connect,
    disconnect,
  };
}
