import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  disconnectCanva,
  fetchCanvaDesigns,
  fetchCanvaStatus,
  type CanvaDesignsPage,
  type CanvaStatus,
} from '../lib/canvaApi';

const CANVA_STATUS_KEY = ['canva', 'status'] as const;
const CANVA_DESIGNS_KEY = ['canva', 'designs'] as const;

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
      void queryClient.removeQueries({ queryKey: CANVA_DESIGNS_KEY });
    },
  });
}

/**
 * Paginated list of the connected user's Canva designs. Only runs when `enabled`
 * (i.e. the account is connected); pages follow Canva's `continuation` cursor.
 */
export function useCanvaDesigns(enabled: boolean) {
  return useInfiniteQuery<CanvaDesignsPage>({
    queryKey: CANVA_DESIGNS_KEY,
    queryFn: ({ pageParam }) =>
      fetchCanvaDesigns(typeof pageParam === 'string' ? { continuation: pageParam } : {}),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.continuation ?? undefined,
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
