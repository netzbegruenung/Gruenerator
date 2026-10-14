import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetSort,
} from '@gruenerator/contracts';
import { useStudioAssets } from '@gruenerator/shared/studio-assets';
import { useEffect, useMemo, useState } from 'react';

import { type StudioAssetSectionData } from './StudioAssetSection';

const SEARCH_DEBOUNCE_MS = 400;

export function useDebouncedSearch(input: string): string {
  const [q, setQ] = useState(input.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  return q;
}

type Query = ReturnType<typeof useStudioAssets>;

function section(queries: Query[], items: StudioAssetItem[]): StudioAssetSectionData {
  const next = queries.find((query) => query.hasNextPage);
  const failed = queries.find((query) => query.error);
  return {
    items,
    error: failed?.error ?? null,
    retry: () => void (failed?.isFetchNextPageError ? failed.fetchNextPage() : failed?.refetch()),
    isLoading: queries.some((query) => query.isLoading),
    hasNextPage: next !== undefined,
    isFetchingNextPage: queries.some((query) => query.isFetchingNextPage),
    fetchNextPage: () => void next?.fetchNextPage(),
  };
}

/**
 * Die eigene Sammlung einer Art: was die Person angelegt hat und was sie sich
 * unter „Entdecken“ gemerkt hat — Gemerktes steht ohne eigene Überschrift mit
 * drin, wie das Hinzugefügte auf `/grueneratoren`.
 */
export function useOwnStudioAssets(kind: StudioAssetKind, q: string) {
  const mine = useStudioAssets({ kind, scope: 'mine', q, sort: 'new' });
  const saved = useStudioAssets({ kind, scope: 'saved', q, sort: 'new' });
  const items = useMemo(() => {
    const ids = new Set(mine.items.map((item) => item.id));
    return [...mine.items, ...saved.items.filter((item) => !ids.has(item.id))];
  }, [mine.items, saved.items]);
  return {
    data: section([mine, saved], items),
    error: mine.error ?? saved.error,
    settled: mine.isSuccess && saved.isSuccess,
  };
}

/** Was andere öffentlich teilen — eine Art im Entdecken-Popup. */
export function useDiscoverStudioAssets(kind: StudioAssetKind, q: string, sort: StudioAssetSort) {
  const shop = useStudioAssets({ kind, scope: 'shop', q, sort });
  return { data: section([shop], shop.items), error: shop.error, settled: shop.isSuccess };
}
