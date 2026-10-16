import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetSort,
} from '@gruenerator/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useStudioAssets } from './useStudioAssets.js';

const SEARCH_DEBOUNCE_MS = 400;

export function useDebouncedSearch(input: string): string {
  const [q, setQ] = useState(input.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  return q;
}

/** Ein Abschnitt „Sticker“ bzw. „Hintergründe“ — eine oder mehrere Listen als eine. */
export interface StudioAssetSectionData {
  items: StudioAssetItem[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  error: Error | null;
  retry: () => void;
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

/** Eigenes zuerst, dahinter Gemerktes — was beides ist, steht nur einmal. */
export function mergeOwnAndSaved(
  mine: StudioAssetItem[],
  saved: StudioAssetItem[]
): StudioAssetItem[] {
  const ids = new Set(mine.map((item) => item.id));
  return [...mine, ...saved.filter((item) => !ids.has(item.id))];
}

/**
 * Die eigene Sammlung einer Art: was die Person angelegt hat und was sie sich
 * unter „Entdecken“ gemerkt hat — Gemerktes steht ohne eigene Überschrift mit
 * drin, wie das Hinzugefügte auf `/grueneratoren`.
 */
export function useOwnStudioAssets(kind: StudioAssetKind, q: string) {
  const mine = useStudioAssets({ kind, scope: 'mine', q, sort: 'new' });
  const saved = useStudioAssets({ kind, scope: 'saved', q, sort: 'new' });
  const items = useMemo(() => mergeOwnAndSaved(mine.items, saved.items), [mine.items, saved.items]);
  return {
    data: section([mine, saved], items),
    error: mine.error ?? saved.error,
    settled: mine.isSuccess && saved.isSuccess,
  };
}

/** Was andere öffentlich teilen — eine Art unter „Entdecken“. */
export function useDiscoverStudioAssets(kind: StudioAssetKind, q: string, sort: StudioAssetSort) {
  const shop = useStudioAssets({ kind, scope: 'shop', q, sort });
  return { data: section([shop], shop.items), error: shop.error, settled: shop.isSuccess };
}
