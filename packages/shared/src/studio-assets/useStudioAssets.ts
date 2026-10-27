import {
  type StudioAssetCreateBody,
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetListResponse,
  type StudioAssetScope,
  type StudioAssetSort,
  type StudioAssetUpdateBody,
} from '@gruenerator/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';
import { MARKETPLACE_QUERY_KEY } from '../marketplace/useMarketplace.js';

import {
  patchStudioAssetPages,
  removeStudioAssetFromPages,
  toggledLike,
  type StudioAssetPages,
} from './cache.js';

/** Root of every studio-asset query; the Papierkorb invalidates it on restore. */
export const STUDIO_ASSETS_QUERY_KEY = ['studio-assets'] as const;
export const STUDIO_ASSETS_PAGE_SIZE = 48;

export interface StudioAssetsFilter {
  kind: StudioAssetKind;
  scope: StudioAssetScope;
  /** Search text; empty means no search. */
  q: string;
  sort: StudioAssetSort;
}

export const studioAssetsKey = ({ kind, scope, q, sort }: StudioAssetsFilter) =>
  [...STUDIO_ASSETS_QUERY_KEY, kind, scope, q, sort] as const;

export function useStudioAssets(filter: StudioAssetsFilter) {
  const { kind, scope, q, sort } = filter;
  const query = useInfiniteQuery({
    queryKey: studioAssetsKey(filter),
    queryFn: async ({ pageParam }): Promise<StudioAssetListResponse> => {
      const res = await getContractsClient().studioAssets.list({
        query: {
          kind,
          scope,
          sort,
          offset: pageParam,
          limit: STUDIO_ASSETS_PAGE_SIZE,
          ...(q ? { q } : {}),
        },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Sticker konnten nicht geladen werden.');
      return res.body;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastOffset) =>
      lastPage.hasMore ? lastOffset + STUDIO_ASSETS_PAGE_SIZE : undefined,
    placeholderData: keepPreviousData,
  });

  const items = useMemo<StudioAssetItem[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return { ...query, items };
}

function patchEverywhere(
  qc: QueryClient,
  id: string,
  patch: (item: StudioAssetItem) => StudioAssetItem
) {
  qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
    data ? patchStudioAssetPages(data, id, patch) : data
  );
}

const toggledFavorite = (item: StudioAssetItem): StudioAssetItem => ({
  ...item,
  favorited: !item.favorited,
});

export function useStudioAssetMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY });

  const create = useMutation({
    mutationFn: async (body: StudioAssetCreateBody) => {
      const res = await getContractsClient().studioAssets.create({ body });
      if (res.status !== 201)
        throw apiErrorFromResponse(res, 'Sticker konnte nicht gespeichert werden.');
      return res.body;
    },
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: StudioAssetUpdateBody }) => {
      const res = await getContractsClient().studioAssets.update({ params: { id }, body });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Änderung konnte nicht gespeichert werden.');
      return res.body;
    },
    onSuccess: (updated) => {
      qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
        data ? patchStudioAssetPages(data, updated.id, () => updated) : data
      );
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await getContractsClient().studioAssets.remove({ params: { id } });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Sticker konnte nicht gelöscht werden.');
      return id;
    },
    onSuccess: (id) => {
      qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
        data ? removeStudioAssetFromPages(data, id) : data
      );
    },
    onSettled: invalidate,
  });

  /** Instance admins: list a public asset under „Offiziell“ in the Marktplatz, or stop. */
  const setOfficial = useMutation({
    mutationFn: async ({ id, official }: { id: string; official: boolean }) => {
      const res = await getContractsClient().studioAssets.official({
        params: { id },
        body: { official },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Änderung konnte nicht gespeichert werden.');
      return res.body;
    },
    onSuccess: (updated) => {
      qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
        data ? patchStudioAssetPages(data, updated.id, () => updated) : data
      );
      void qc.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY });
    },
    onSettled: invalidate,
  });

  return { create, update, remove, setOfficial };
}

/**
 * Like and Merken for one item. Each toggle kind runs in its own mutation scope
 * per item, so rapid clicks reach the server in order; every click still shows
 * optimistically at once, and only the last response of a scope writes back.
 */
export function useStudioAssetToggles(id: string) {
  const qc = useQueryClient();
  const likeScope = `like:${id}`;
  const favoriteScope = `favorite:${id}`;
  const othersInScope = (scopeId: string) =>
    qc.isMutating({ predicate: (m) => m.options.scope?.id === scopeId }) > 1;

  const settle = async (scopeId: string) => {
    if (!othersInScope(scopeId)) await qc.invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY });
  };

  const like = useMutation({
    scope: { id: likeScope },
    mutationFn: async (item: StudioAssetItem) => {
      const client = getContractsClient().studioAssets;
      const params = { id: item.id };
      const res = item.liked ? await client.unlike({ params }) : await client.like({ params });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Gefällt mir konnte nicht gespeichert werden.');
      return res.body;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY });
      patchEverywhere(qc, id, toggledLike);
    },
    onSuccess: ({ liked, likesCount }) => {
      if (othersInScope(likeScope)) return;
      patchEverywhere(qc, id, (i) => ({ ...i, liked, likesCount }));
    },
    onError: () => patchEverywhere(qc, id, toggledLike),
    onSettled: () => settle(likeScope),
  });

  const favorite = useMutation({
    scope: { id: favoriteScope },
    mutationFn: async (item: StudioAssetItem) => {
      const client = getContractsClient().studioAssets;
      const params = { id: item.id };
      const res = item.favorited
        ? await client.unfavorite({ params })
        : await client.favorite({ params });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Merken konnte nicht gespeichert werden.');
      return res.body;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY });
      patchEverywhere(qc, id, toggledFavorite);
    },
    onSuccess: ({ favorited }) => {
      if (othersInScope(favoriteScope)) return;
      patchEverywhere(qc, id, (i) => ({ ...i, favorited }));
    },
    onError: () => patchEverywhere(qc, id, toggledFavorite),
    onSettled: () => settle(favoriteScope),
  });

  return { toggleLike: like.mutate, toggleFavorite: favorite.mutate };
}
