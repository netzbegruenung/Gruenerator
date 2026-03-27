import { getGlobalApiClient } from '@gruenerator/shared/api';
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

const POLL_INTERVAL = 3000;
const TERMINAL_STATUSES = ['completed', 'error', 'failed'];

export function useNotebookCollections() {
  const [collections, setCollections] = useState<MobileNotebookCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const fetchCollections = useCallback(async () => {
    try {
      setIsLoading(true);
      const client = getGlobalApiClient();
      const response = await client.get('/auth/notebook-collections');
      setCollections(response.data.collections ?? []);
    } catch {
      setCollections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
    return () => {
      pollTimers.current.forEach((timer) => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, [fetchCollections]);

  const startPolling = useCallback(
    (collectionId: string, documentId: string) => {
      if (pollTimers.current.has(collectionId)) return;

      setProcessingIds((prev) => new Set([...prev, collectionId]));

      const timer = setInterval(async () => {
        try {
          const client = getGlobalApiClient();
          const response = await client.get(`/documents/${documentId}/status`);
          const status = response.data?.data?.status as string;

          if (TERMINAL_STATUSES.includes(status)) {
            clearInterval(timer);
            pollTimers.current.delete(collectionId);
            setProcessingIds((prev) => {
              const next = new Set(prev);
              next.delete(collectionId);
              return next;
            });
            await fetchCollections();
          }
        } catch {
          clearInterval(timer);
          pollTimers.current.delete(collectionId);
          setProcessingIds((prev) => {
            const next = new Set(prev);
            next.delete(collectionId);
            return next;
          });
        }
      }, POLL_INTERVAL);

      pollTimers.current.set(collectionId, timer);
    },
    [fetchCollections]
  );

  const createCollection = useCallback(
    async (params: CreateCollectionParams): Promise<{ id: string } | null> => {
      try {
        const client = getGlobalApiClient();
        const response = await client.post('/auth/notebook-collections', {
          name: params.name,
          description: params.description,
          selection_mode: 'documents',
          document_ids: [params.documentId],
        });

        if (response.data.success) {
          const collectionId = response.data.collection.id;
          await fetchCollections();
          startPolling(collectionId, params.documentId);
          return { id: collectionId };
        }

        throw new Error(response.data.error || 'Erstellung fehlgeschlagen');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Erstellen';
        Alert.alert('Fehler', message);
        return null;
      }
    },
    [fetchCollections, startPolling]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const client = getGlobalApiClient();
        await client.delete(`/auth/notebook-collections/${id}`);
        await fetchCollections();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Löschen';
        Alert.alert('Fehler', message);
        return false;
      }
    },
    [fetchCollections]
  );

  return {
    collections,
    isLoading,
    processingIds,
    refetch: fetchCollections,
    createCollection,
    deleteCollection,
  };
}
