import {
  type MarketplaceItem,
  type MarketplaceLikeResponse,
  type MarketplaceSaveResponse,
} from '@gruenerator/contracts';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { apiErrorFromResponse, getContractsClient, isApiErrorWithStatus } from '../api/index.js';

import {
  likeToggled,
  patchMarketplaceCache,
  relatedQueryKeys,
  saveToggled,
  withLike,
  withSaved,
  type MarketplaceCacheData,
} from './cache.js';
import { MARKETPLACE_QUERY_KEY } from './useMarketplace.js';

type Action = 'like' | 'save';

function patchEverywhere(
  qc: QueryClient,
  item: MarketplaceItem,
  patch: (item: MarketplaceItem) => MarketplaceItem
) {
  qc.setQueriesData<MarketplaceCacheData>({ queryKey: MARKETPLACE_QUERY_KEY }, (data) =>
    data ? patchMarketplaceCache(data, item, patch) : data
  );
}

const mutationKey = (action: Action) => [...MARKETPLACE_QUERY_KEY, action] as const;

/** Another click on the same item is still in flight — its answer is the one to keep. */
const othersPending = (qc: QueryClient, action: Action, item: MarketplaceItem) =>
  qc.isMutating({
    mutationKey: mutationKey(action),
    predicate: (m) => (m.state.variables as MarketplaceItem | null)?.key === item.key,
  }) > 1;

async function settle(qc: QueryClient, action: Action, item: MarketplaceItem) {
  if (othersPending(qc, action, item)) return;
  await Promise.all(
    [MARKETPLACE_QUERY_KEY, ...relatedQueryKeys(item.kind, action)].map((queryKey) =>
      qc.invalidateQueries({ queryKey })
    )
  );
}

/**
 * Rapid clicks on one item reach the server in order (a PUT overtaken by its
 * DELETE would leave the opposite state); different items run in parallel.
 */
function useItemQueue() {
  const tails = useRef(new Map<string, Promise<unknown>>());
  return useCallback(<T>(key: string, run: () => Promise<T>): Promise<T> => {
    const next = (tails.current.get(key) ?? Promise.resolve()).catch(() => null).then(run);
    tails.current.set(key, next);
    const release = () => {
      if (tails.current.get(key) === next) tails.current.delete(key);
    };
    void next.then(release, release);
    return next;
  }, []);
}

/**
 * Like for any Marktplatz item. Shows at once in every cached Marktplatz list,
 * rolls back on error, and refreshes the lists outside the Marktplatz that show
 * the same like (`/vorlagen`, the sticker gallery).
 */
export function useMarketplaceLike() {
  const qc = useQueryClient();
  const enqueue = useItemQueue();

  return useMutation({
    mutationKey: mutationKey('like'),
    mutationFn: (item: MarketplaceItem) =>
      enqueue(item.key, async (): Promise<MarketplaceLikeResponse> => {
        const client = getContractsClient().marketplace;
        const params = { kind: item.kind, ref: item.ref };
        const res = item.liked ? await client.unlike({ params }) : await client.like({ params });
        if (res.status !== 200)
          throw apiErrorFromResponse(res, 'Gefällt mir konnte nicht gespeichert werden.');
        return res.body;
      }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: MARKETPLACE_QUERY_KEY });
      patchEverywhere(qc, item, likeToggled);
    },
    onSuccess: ({ liked, likesCount }, item) => {
      if (othersPending(qc, 'like', item)) return;
      patchEverywhere(qc, item, (i) => withLike(i, liked, likesCount));
    },
    onError: (_error, item) =>
      patchEverywhere(qc, item, (i) => withLike(i, item.liked, item.likesCount)),
    onSettled: (_data, _error, item) => settle(qc, 'like', item),
  });
}

/**
 * Save: Agents and Rezepte go to „Meine Grüneratoren", everything else to
 * „Gemerkt". A full library answers 409 — the error keeps that status
 * (`isLibraryFullError`) and the server's sentence, for the caller to show.
 */
export function useMarketplaceSave() {
  const qc = useQueryClient();
  const enqueue = useItemQueue();

  return useMutation({
    mutationKey: mutationKey('save'),
    mutationFn: (item: MarketplaceItem) =>
      enqueue(item.key, async (): Promise<MarketplaceSaveResponse> => {
        const client = getContractsClient().marketplace;
        const params = { kind: item.kind, ref: item.ref };
        const res = item.saved ? await client.unsave({ params }) : await client.save({ params });
        if (res.status !== 200)
          throw apiErrorFromResponse(res, 'Merken konnte nicht gespeichert werden.');
        return res.body;
      }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: MARKETPLACE_QUERY_KEY });
      patchEverywhere(qc, item, saveToggled);
    },
    onSuccess: ({ saved }, item) => {
      if (othersPending(qc, 'save', item)) return;
      patchEverywhere(qc, item, (i) => withSaved(i, saved));
    },
    onError: (_error, item) => patchEverywhere(qc, item, (i) => withSaved(i, item.saved)),
    onSettled: (_data, _error, item) => settle(qc, 'save', item),
  });
}

/** „Meine Grüneratoren" is full (`USER_LIBRARY_MAX_ITEMS`). */
export const isLibraryFullError = (error: unknown): boolean => isApiErrorWithStatus(error, 409);
