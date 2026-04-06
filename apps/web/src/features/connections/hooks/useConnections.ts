import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchConnectionStatus,
  createSessionToken,
  disconnectProvider,
  type ConnectionStatus,
} from '../lib/connectionsApi';

const CONNECTIONS_KEY = ['connections', 'status'] as const;

export function useConnectionStatus() {
  return useQuery<ConnectionStatus[]>({
    queryKey: CONNECTIONS_KEY,
    queryFn: fetchConnectionStatus,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateSessionToken() {
  return useMutation({
    mutationFn: createSessionToken,
  });
}

export function useDisconnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectProvider,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}
