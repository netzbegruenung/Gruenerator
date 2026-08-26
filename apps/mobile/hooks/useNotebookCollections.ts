import { deriveIndexingState, type TransformedCollection } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Alert } from 'react-native';

/**
 * The fields the Wissen tab renders. Derived from the contract's collection
 * shape rather than re-declared, so a field that changes on the wire changes
 * here too — a hand-written parallel interface is what let mobile keep polling
 * for a `'error'` status the server has never sent.
 */
export type MobileNotebookCollection = Pick<
  TransformedCollection,
  'id' | 'name' | 'description' | 'document_count' | 'documents' | 'indexing_state'
>;

interface CreateCollectionParams {
  name: string;
  description?: string;
  documentId: string;
}

const QUERY_KEY = ['notebook-collections'] as const;

/** Matches the web notebook list — see useProfileData's `refetchInterval`. */
const INDEXING_POLL_MS = 5000;

/** Stable empty identity, so an errored fetch never churns consumers. */
const EMPTY: MobileNotebookCollection[] = [];

/** Readiness as the server derived it, or derived here for an older backend. */
export function collectionIndexingState(collection: MobileNotebookCollection) {
  return collection.indexing_state ?? deriveIndexingState(collection.documents);
}

async function fetchCollections(): Promise<MobileNotebookCollection[]> {
  const client = getContractsClient();
  const result = await client.notebookCollections.listCollections();
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
  return result.body.collections;
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
 *
 * Indexing progress is read off the list itself. There used to be a per-document
 * poller here, hitting `/documents/:id/status` every three seconds for each
 * notebook created in this session. It had three faults that all disappear with
 * it: it accepted `status='completed'` without checking that any vector was
 * produced (a document that indexed to nothing looked finished), it watched for
 * a `'error'` status the server never sends, and its state lived in a ref that
 * died on unmount — so a notebook still importing was indistinguishable from a
 * finished one after a tab switch, and an import started on another device was
 * never shown at all.
 */
export function useNotebookCollections() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchCollections().catch(() => EMPTY),
    // Indexing finishes in the background with nothing pushing the result to the
    // device. Stops on its own once every notebook is settled.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => collectionIndexingState(c) === 'indexing')
        ? INDEXING_POLL_MS
        : false,
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    // The chat's file-mention picker caches the same list under its own prefix.
    await queryClient.invalidateQueries({ queryKey: ['file-mention'] });
  }, [queryClient]);

  const createCollection = useCallback(
    async (params: CreateCollectionParams): Promise<{ id: string } | null> => {
      try {
        const client = getContractsClient();
        const result = await client.notebookCollections.createCollection({
          body: {
            name: params.name,
            description: params.description ?? null,
            selection_mode: 'documents',
            document_ids: [params.documentId],
          },
        });

        if (result.status !== 201) throw new Error('Erstellung fehlgeschlagen');

        await refetch();
        return { id: result.body.collection.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Erstellen';
        Alert.alert('Fehler', message);
        return null;
      }
    },
    [refetch]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const client = getContractsClient();
        const result = await client.notebookCollections.deleteCollection({ params: { id } });
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
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
    refetch,
    createCollection,
    deleteCollection,
  };
}
