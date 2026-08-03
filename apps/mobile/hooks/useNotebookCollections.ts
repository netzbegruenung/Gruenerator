import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

export interface MobileNotebookCollection {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

interface CreateCollectionParams {
  name: string;
  description?: string;
  documentId: string;
}

const QUERY_KEY = ['notebook-collections'] as const;
const POLL_INTERVAL = 3000;
const TERMINAL_STATUSES = ['completed', 'error', 'failed'];

/** Stable empty identity, so an errored fetch never churns consumers. */
const EMPTY: MobileNotebookCollection[] = [];

async function fetchCollections(): Promise<MobileNotebookCollection[]> {
  const client = getGlobalApiClient();
  interface NotebookCollectionsResponse {
    collections?: MobileNotebookCollection[];
  }
  const response = await client.get<NotebookCollectionsResponse>('/auth/notebook-collections');
  return response.data.collections ?? [];
}

/**
 * The user's own notebooks, on the Wissen tab.
 *
 * Through TanStack Query rather than `useState` + `useEffect`: the hook used to
 * refetch on every mount and start each time with `isLoading: true`, so the
 * "Meine Notebooks" section flashed its three skeleton rows on every visit even
 * though the answer had not changed. Same fix, same reason as
 * `useOfficeExtraItems` on the Arbeiten tab.
 *
 * The failure shape is kept from before — an error resolves to an empty list
 * rather than surfacing, because the section sits under five other sections that
 * are perfectly usable without it.
 */
export function useNotebookCollections() {
  const queryClient = useQueryClient();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchCollections().catch(() => EMPTY),
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  // Timers outlive a single render but not the screen; clearing them on unmount
  // is what stops a deleted notebook from being polled forever.
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      timers.forEach((timer) => clearInterval(timer));
      timers.clear();
    };
  }, []);

  const startPolling = useCallback(
    (collectionId: string, documentId: string) => {
      if (pollTimers.current.has(collectionId)) return;

      setProcessingIds((prev) => new Set([...prev, collectionId]));

      const stop = (refresh: boolean) => {
        const timer = pollTimers.current.get(collectionId);
        if (timer) clearInterval(timer);
        pollTimers.current.delete(collectionId);
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(collectionId);
          return next;
        });
        if (refresh) void refetch();
      };

      const timer = setInterval(async () => {
        try {
          const client = getGlobalApiClient();
          interface DocumentStatusResponse {
            data?: { status?: string };
          }
          const response = await client.get<DocumentStatusResponse>(
            `/documents/${documentId}/status`
          );
          const status = response.data?.data?.status ?? '';

          if (TERMINAL_STATUSES.includes(status)) stop(true);
        } catch {
          stop(false);
        }
      }, POLL_INTERVAL);

      pollTimers.current.set(collectionId, timer);
    },
    [refetch]
  );

  const createCollection = useCallback(
    async (params: CreateCollectionParams): Promise<{ id: string } | null> => {
      try {
        const client = getGlobalApiClient();
        interface CreateCollectionResponse {
          success: boolean;
          collection: { id: string };
          error?: string;
        }
        const response = await client.post<CreateCollectionResponse>('/auth/notebook-collections', {
          name: params.name,
          description: params.description,
          selection_mode: 'documents',
          document_ids: [params.documentId],
        });

        if (response.data.success) {
          const collectionId = response.data.collection.id;
          await refetch();
          startPolling(collectionId, params.documentId);
          return { id: collectionId };
        }

        throw new Error(response.data.error ?? 'Erstellung fehlgeschlagen');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Erstellen';
        Alert.alert('Fehler', message);
        return null;
      }
    },
    [refetch, startPolling]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const client = getGlobalApiClient();
        await client.delete(`/auth/notebook-collections/${id}`);
        await refetch();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Löschen';
        Alert.alert('Fehler', message);
        return false;
      }
    },
    [refetch]
  );

  return {
    collections: data ?? EMPTY,
    isLoading,
    processingIds,
    refetch,
    createCollection,
    deleteCollection,
  };
}
