import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { connectInPopup, unwrap } from '@/features/admin/connector-test/connectorTestApi';

// Shared with the admin connector test page, so both show the same state.
const STATUS_KEY = ['connector-test-status'];

/**
 * Microsoft 365 (OneDrive, via Nango) as a card in the connector directory.
 * Instance admins only until it opens to everyone — the server enforces that in
 * `ConnectionService`; `enabled: false` just keeps non-admins from asking.
 */
export function useMicrosoftConnector(enabled: boolean) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => unwrap(await getContractsClient().connectorTest.status()),
    enabled,
  });
  const connect = useMutation({
    mutationFn: () => connectInPopup('microsoft'),
    onSettled: refresh,
  });
  const disconnect = useMutation({
    mutationFn: async () =>
      unwrap(
        await getContractsClient().connectorTest.disconnect({ params: { provider: 'microsoft' } })
      ),
    onSettled: refresh,
  });

  return {
    connected: status.data?.providers.find((p) => p.provider === 'microsoft')?.connected === true,
    connect,
    disconnect,
  };
}
