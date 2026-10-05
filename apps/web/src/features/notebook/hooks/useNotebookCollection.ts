/**
 * Fetch a single notebook collection by UUID or slug-with-suffix.
 *
 * Backs DynamicNotebookPage's access decision so a notebook shared with
 * `share_mode='authenticated'` is reachable via direct URL regardless of the
 * audience filter on the list endpoint. The list query stays audience-scoped
 * for discovery; this hook is the authoritative source for "can I render
 * this notebook page right now?".
 */
import { deriveIndexingState, type TransformedCollection } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

export type NotebookCollectionFetchError = 'not-found' | 'forbidden' | 'unknown';

const notebookCollectionKey = (slugOrId: string | undefined) =>
  ['notebook', 'collection', slugOrId] as const;

async function fetchNotebookCollection(slugOrId: string) {
  const result = await getContractsClient().notebookCollections.getCollection({
    params: { slugOrId },
  });
  if (result.status === 200) {
    return { collection: result.body.collection, error: null as null };
  }
  const error: NotebookCollectionFetchError =
    result.status === 404 ? 'not-found' : result.status === 403 ? 'forbidden' : 'unknown';
  return { collection: null, error };
}

/**
 * The notebook as the user's own or shared list already knows it — usually
 * it was clicked from exactly that list. The public list is left out: it is
 * enriched without indexing state and may hold notebooks this user cannot open.
 */
function findInListCaches(
  queryClient: QueryClient,
  slugOrId: string
): TransformedCollection | null {
  const suffix = extractSlugSuffix(slugOrId);
  for (const [key, list] of queryClient.getQueriesData<TransformedCollection[]>({
    queryKey: ['notebookCollections'],
  })) {
    if (key[1] === 'public' || !Array.isArray(list)) continue;
    const hit = list.find(
      (c) => c.id === slugOrId || (suffix !== null && c.slug_suffix === suffix)
    );
    if (hit) return hit;
  }
  return null;
}

/** Warm the page's query before the click lands (hover/focus on a link). */
export function prefetchNotebookCollection(queryClient: QueryClient, slugOrId: string) {
  return queryClient.prefetchQuery({
    queryKey: notebookCollectionKey(slugOrId),
    queryFn: () => fetchNotebookCollection(slugOrId),
    meta: { silent: true },
  });
}

export function useNotebookCollection(slugOrId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: notebookCollectionKey(slugOrId),
    enabled: !!slugOrId,
    retry: false,
    // Render from the list entry while the request confirms access in the
    // background; a 403/404 still replaces it once the answer is in.
    placeholderData: () => {
      const collection = slugOrId ? findInListCaches(queryClient, slugOrId) : null;
      return collection ? { collection, error: null as null } : undefined;
    },
    // Indexing finishes in the background and nothing pushes the result here,
    // so a notebook opened straight after creation would keep showing its
    // "sources still indexing" banner until a manual reload. Stops on its own.
    refetchInterval: (q) => {
      const collection = q.state.data?.collection;
      if (!collection) return false;
      const state = collection.indexing_state ?? deriveIndexingState(collection.documents ?? []);
      return state === 'indexing' ? 5000 : false;
    },
    queryFn: () => {
      if (!slugOrId) {
        throw new Error('slugOrId is required');
      }
      return fetchNotebookCollection(slugOrId);
    },
  });
}
