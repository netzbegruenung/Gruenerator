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
  type QueryKey,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

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

type Snapshot = Array<[QueryKey, StudioAssetPages | undefined]>;

/** Optimistically patches the item in every cached list; returns what to roll back to. */
async function patchEverywhere(
  qc: QueryClient,
  id: string,
  patch: (item: StudioAssetItem) => StudioAssetItem
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY });
  const snapshot = qc.getQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY });
  qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
    data ? patchStudioAssetPages(data, id, patch) : data
  );
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

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

  const toggleLike = useMutation({
    mutationFn: async (item: StudioAssetItem) => {
      const client = getContractsClient().studioAssets;
      const params = { id: item.id };
      const res = item.liked ? await client.unlike({ params }) : await client.like({ params });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Gefällt mir konnte nicht gespeichert werden.');
      return res.body;
    },
    onMutate: (item) => patchEverywhere(qc, item.id, toggledLike),
    onSuccess: ({ liked, likesCount }, item) => {
      qc.setQueriesData<StudioAssetPages>({ queryKey: STUDIO_ASSETS_QUERY_KEY }, (data) =>
        data ? patchStudioAssetPages(data, item.id, (i) => ({ ...i, liked, likesCount })) : data
      );
    },
    onError: (_error, _item, snapshot) => restore(qc, snapshot),
    onSettled: invalidate,
  });

  const toggleFavorite = useMutation({
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
    onMutate: (item) => patchEverywhere(qc, item.id, (i) => ({ ...i, favorited: !i.favorited })),
    onError: (_error, _item, snapshot) => restore(qc, snapshot),
    onSettled: invalidate,
  });

  return { create, update, remove, toggleLike, toggleFavorite };
}
