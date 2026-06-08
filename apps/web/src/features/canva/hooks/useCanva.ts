import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { disconnectCanva, fetchCanvaStatus, type CanvaStatus } from '../lib/canvaApi';

const CANVA_STATUS_KEY = ['canva', 'status'] as const;

export function useCanvaStatus() {
  return useQuery<CanvaStatus>({
    queryKey: CANVA_STATUS_KEY,
    queryFn: fetchCanvaStatus,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useInvalidateCanvaStatus() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CANVA_STATUS_KEY });
}

export function useDisconnectCanva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectCanva,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CANVA_STATUS_KEY });
    },
  });
}
