import { type MarketplaceCollectionId } from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

import { collectionContents, type CollectionContents } from './frontpage.js';
import { marketplaceKeys } from './useMarketplace.js';

type Ids = MarketplaceCollectionId[];

/**
 * The collections the viewer subscribed to. Both mutations show at once and
 * roll back on error; the server answer settles the list afterwards.
 */
export function useCollectionSubscriptions() {
  const qc = useQueryClient();
  const queryKey = marketplaceKeys.subscriptions();

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Ids> => {
      const res = await getContractsClient().marketplace.subscriptions();
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Die Abos konnten nicht geladen werden.');
      return res.body.collectionIds;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, subscribe }: { id: MarketplaceCollectionId; subscribe: boolean }) => {
      const client = getContractsClient().marketplace;
      const params = { collectionId: id };
      const res = subscribe
        ? await client.subscribe({ params })
        : await client.unsubscribe({ params });
      if (res.status !== 200)
        throw apiErrorFromResponse(
          res,
          subscribe ? 'Abonnieren fehlgeschlagen.' : 'Abbestellen fehlgeschlagen.'
        );
    },
    onMutate: async ({ id, subscribe }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Ids>(queryKey);
      qc.setQueryData<Ids>(queryKey, (ids = []) =>
        subscribe ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((i) => i !== id)
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const ids = useMemo<Ids>(() => query.data ?? [], [query.data]);
  const { mutateAsync } = mutation;

  return {
    ids,
    isSubscribed: useCallback((id: MarketplaceCollectionId) => ids.includes(id), [ids]),
    subscribe: useCallback(
      (id: MarketplaceCollectionId) => mutateAsync({ id, subscribe: true }),
      [mutateAsync]
    ),
    unsubscribe: useCallback(
      (id: MarketplaceCollectionId) => mutateAsync({ id, subscribe: false }),
      [mutateAsync]
    ),
    isLoading: query.isLoading,
  };
}

/** The contents of every subscribed collection that exists for this audience. */
export function useSubscribedContents(locale: 'de-DE' | 'de-AT'): CollectionContents[] {
  const { ids } = useCollectionSubscriptions();
  return useMemo(
    () =>
      ids.flatMap((id) => {
        const contents = collectionContents(id, locale);
        return contents ? [contents] : [];
      }),
    [ids, locale]
  );
}
