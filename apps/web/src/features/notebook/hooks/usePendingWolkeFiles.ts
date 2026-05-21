/**
 * React Query hooks for the Wolke folder watcher's pending-files UI.
 *
 * Backed by the typed `wolkePending` contract client. The hourly watcher
 * records new Wolke files as "pending"; these hooks let the owner list them,
 * import one on demand ("Hinzufügen"), dismiss one, and toggle hourly watching.
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const pendingKey = (collectionId: string) => ['wolkePending', collectionId] as const;

export function usePendingWolkeFiles(collectionId: string, enabled = true) {
  return useQuery({
    queryKey: pendingKey(collectionId),
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.wolkePending.listPendingFiles({ params: { id: collectionId } });
      if (result.status !== 200) {
        throw new Error(`Failed to load pending files (HTTP ${result.status})`);
      }
      return result.body.pending;
    },
    enabled: enabled && collectionId.length > 0,
    staleTime: 60_000,
  });
}

export function useAddPendingFile(collectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pendingId: string) => {
      const client = getContractsClient();
      const result = await client.wolkePending.addPendingFile({
        params: { id: collectionId, pendingId },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to add file (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pendingKey(collectionId) });
      // The notebook gained a document — refresh its detail + listings.
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
    },
  });
}

export function useDismissPendingFile(collectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pendingId: string) => {
      const client = getContractsClient();
      const result = await client.wolkePending.dismissPendingFile({
        params: { id: collectionId, pendingId },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to dismiss file (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pendingKey(collectionId) });
    },
  });
}

export function useSetNotebookAutoSync(collectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const client = getContractsClient();
      const result = await client.wolkePending.setNotebookAutoSync({
        params: { id: collectionId },
        body: { enabled },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to update watch setting (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
    },
  });
}
