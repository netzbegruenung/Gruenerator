/**
 * Fetch a single notebook collection by UUID or slug-with-suffix.
 *
 * Backs DynamicNotebookPage's access decision so a notebook shared with
 * `share_mode='authenticated'` is reachable via direct URL regardless of the
 * audience filter on the list endpoint. The list query stays audience-scoped
 * for discovery; this hook is the authoritative source for "can I render
 * this notebook page right now?".
 */
import { deriveIndexingState } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type NotebookCollectionFetchError = 'not-found' | 'forbidden' | 'unknown';

export function useNotebookCollection(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['notebook', 'collection', slugOrId],
    enabled: !!slugOrId,
    retry: false,
    // Indexing finishes in the background and nothing pushes the result here,
    // so a notebook opened straight after creation would keep showing its
    // "sources still indexing" banner until a manual reload. Stops on its own.
    refetchInterval: (q) => {
      const collection = q.state.data?.collection;
      if (!collection) return false;
      const state = collection.indexing_state ?? deriveIndexingState(collection.documents ?? []);
      return state === 'indexing' ? 5000 : false;
    },
    queryFn: async () => {
      if (!slugOrId) {
        throw new Error('slugOrId is required');
      }
      const client = getContractsClient();
      const result = await client.notebookCollections.getCollection({
        params: { slugOrId },
      });
      if (result.status === 200) {
        return { collection: result.body.collection, error: null as null };
      }
      const error: NotebookCollectionFetchError =
        result.status === 404 ? 'not-found' : result.status === 403 ? 'forbidden' : 'unknown';
      return { collection: null, error };
    },
  });
}
