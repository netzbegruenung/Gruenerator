import {
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceListResponse,
  type MarketplaceOrigin,
  type MarketplacePlatform,
  type MarketplaceScope,
  type MarketplaceSection,
  type MarketplaceSort,
} from '@gruenerator/contracts';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

import { type MarketplaceTarget } from './cache.js';

/** Root of every Marktplatz query; interactions patch and invalidate below it. */
export const MARKETPLACE_QUERY_KEY = ['marketplace'] as const;
export const MARKETPLACE_PAGE_SIZE = 24;
export const MARKETPLACE_SECTION_LIMIT = 12;

interface MarketplaceQueryBase {
  origin: MarketplaceOrigin | null;
  /** Search text; empty means no search. */
  q: string;
  sort: MarketplaceSort;
  scope: MarketplaceScope;
  platform: MarketplacePlatform;
  /** One Landesverband by its LV id — the Marktplatz page of that Landesverband. */
  lv?: string;
  /** Default `true`; a closed picker passes `false`. */
  enabled?: boolean;
}

export interface MarketplaceSectionsParams extends MarketplaceQueryBase {
  /** Also the client's capability declaration — the server answers only these kinds. */
  kinds: readonly MarketplaceKind[];
  sectionLimit?: number;
}

export interface MarketplaceKindParams extends MarketplaceQueryBase {
  kind: MarketplaceKind;
}

const filterKey = (p: MarketplaceQueryBase) => ({
  origin: p.origin,
  q: p.q.trim(),
  sort: p.sort,
  scope: p.scope,
  platform: p.platform,
  ...(p.lv ? { lv: p.lv } : {}),
});

export const marketplaceKeys = {
  all: MARKETPLACE_QUERY_KEY,
  sections: (p: MarketplaceSectionsParams) =>
    [
      ...MARKETPLACE_QUERY_KEY,
      'sections',
      {
        kinds: p.kinds.join(','),
        sectionLimit: p.sectionLimit ?? MARKETPLACE_SECTION_LIMIT,
        ...filterKey(p),
      },
    ] as const,
  kind: (p: MarketplaceKindParams) =>
    [...MARKETPLACE_QUERY_KEY, 'kind', { kind: p.kind, ...filterKey(p) }] as const,
  item: (target: MarketplaceTarget, platform: MarketplacePlatform) =>
    [...MARKETPLACE_QUERY_KEY, 'item', { kind: target.kind, ref: target.ref, platform }] as const,
};

/** The query the contract takes; `null`/empty filters are left out rather than sent as strings. */
function listQuery(
  p: MarketplaceQueryBase,
  kinds: readonly MarketplaceKind[],
  page: { offset: number; limit: number } | { sectionLimit: number }
) {
  const q = p.q.trim();
  return {
    kinds: kinds.join(','),
    sort: p.sort,
    scope: p.scope,
    platform: p.platform,
    ...(p.origin !== null ? { origin: p.origin } : {}),
    ...(p.lv ? { lv: p.lv } : {}),
    ...(q ? { q } : {}),
    ...page,
  };
}

async function fetchMarketplace(
  query: ReturnType<typeof listQuery>
): Promise<MarketplaceListResponse> {
  const res = await getContractsClient().marketplace.list({ query });
  if (res.status !== 200)
    throw apiErrorFromResponse(res, 'Der Marktplatz konnte nicht geladen werden.');
  return res.body;
}

/** One section per kind, each with its first `sectionLimit` items — the „Alle" tab. */
export function useMarketplaceSections(params: MarketplaceSectionsParams) {
  const query = useQuery({
    queryKey: marketplaceKeys.sections(params),
    queryFn: () =>
      fetchMarketplace(
        listQuery(params, params.kinds, {
          sectionLimit: params.sectionLimit ?? MARKETPLACE_SECTION_LIMIT,
        })
      ),
    enabled: params.enabled ?? true,
    placeholderData: keepPreviousData,
  });

  const sections = useMemo<MarketplaceSection[]>(() => query.data?.sections ?? [], [query.data]);
  return { ...query, sections };
}

/** One kind, paged by offset — a single-kind tab. */
export function useMarketplaceKind(params: MarketplaceKindParams) {
  const query = useInfiniteQuery({
    queryKey: marketplaceKeys.kind(params),
    queryFn: ({ pageParam }) =>
      fetchMarketplace(
        listQuery(params, [params.kind], { offset: pageParam, limit: MARKETPLACE_PAGE_SIZE })
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastOffset) =>
      lastPage.sections.some((s) => s.hasMore) ? lastOffset + MARKETPLACE_PAGE_SIZE : undefined,
    enabled: params.enabled ?? true,
    placeholderData: keepPreviousData,
  });

  const items = useMemo<MarketplaceItem[]>(
    () => query.data?.pages.flatMap((page) => page.sections.flatMap((s) => s.items)) ?? [],
    [query.data]
  );
  return { ...query, items };
}

/**
 * One item by kind and ref — a shared link (`item=<kind>:<ref>`) or a page
 * that is not a Marktplatz list. Sits under the Marktplatz key, so a like or
 * save patches it like every list. `null` target = nothing to load; a 404
 * (gone, or not for this viewer) is an error.
 */
export function useMarketplaceItem(
  target: MarketplaceTarget | null,
  options: { platform?: MarketplacePlatform; enabled?: boolean } = {}
) {
  const platform = options.platform ?? 'web';
  return useQuery({
    queryKey: marketplaceKeys.item(target ?? { kind: 'agent', ref: '' }, platform),
    queryFn: async (): Promise<MarketplaceItem> => {
      const res = await getContractsClient().marketplace.get({
        params: { kind: target!.kind, ref: target!.ref },
        query: { platform },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Der Eintrag konnte nicht geladen werden.');
      return res.body.item;
    },
    enabled: target !== null && (options.enabled ?? true),
    retry: false,
  });
}
