/**
 * Fetch a single notebook collection by UUID or slug-with-suffix.
 *
 * Backs DynamicNotebookPage's access decision so a notebook shared with
 * `share_mode='authenticated'` is reachable via direct URL regardless of the
 * audience filter on the list endpoint. The list query stays audience-scoped
 * for discovery; this hook is the authoritative source for "can I render
 * this notebook page right now?".
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type NotebookCollectionFetchError = 'not-found' | 'forbidden' | 'unknown';

export function useNotebookCollection(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['notebook', 'collection', slugOrId],
    enabled: !!slugOrId,
    retry: false,
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
