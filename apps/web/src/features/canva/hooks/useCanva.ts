import { type CanvaAutofillSource } from '@gruenerator/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createCanvaAutofill,
  disconnectCanva,
  exportCollectionToCanva,
  fetchCanvaAutofillFields,
  fetchCanvaAutofillSources,
  fetchCanvaDesigns,
  fetchCanvaStatus,
  suggestCanvaAutofill,
  type CanvaDesignsPage,
  type CanvaStatus,
} from '../lib/canvaApi';

const CANVA_STATUS_KEY = ['canva', 'status'] as const;
const CANVA_DESIGNS_KEY = ['canva', 'designs'] as const;

/** Canva is open to instance admins only (the server answers everyone else with 403). */
export function useCanvaStatus(enabled = true) {
  return useQuery<CanvaStatus>({
    queryKey: CANVA_STATUS_KEY,
    queryFn: fetchCanvaStatus,
    enabled,
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

export function useExportCollectionToCanva() {
  return useMutation({ mutationFn: exportCollectionToCanva });
}

/** Plan capabilities and the team's brand templates with data fields. */
export function useCanvaAutofillSources(enabled: boolean) {
  return useQuery({
    queryKey: ['canva', 'autofill', 'sources'],
    queryFn: fetchCanvaAutofillSources,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCanvaAutofillFields(source: CanvaAutofillSource | null) {
  return useQuery({
    queryKey: ['canva', 'autofill', 'fields', source?.kind, source?.id],
    queryFn: () =>
      source ? fetchCanvaAutofillFields(source) : Promise.reject(new Error('Keine Vorlage')),
    enabled: source !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateCanvaAutofill() {
  return useMutation({ mutationFn: createCanvaAutofill });
}

export function useSuggestCanvaAutofill() {
  return useMutation({ mutationFn: suggestCanvaAutofill });
}
