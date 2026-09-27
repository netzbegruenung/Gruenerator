import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchResearch, type SearchParams } from './useResearch';

/** Shorter queries are still being typed — searching them only flickers. */
export const LIVE_SEARCH_MIN_LENGTH = 3;

interface LiveResearchOptions extends SearchParams {
  notebookId?: string;
  enabled: boolean;
}

/**
 * Research search as a query, for search-as-you-type. The query key carries
 * every input, so an answer for an older keystroke can never replace a newer
 * one — the imperative `useResearch` has no such guard.
 */
export function useLiveResearch({ notebookId, enabled, ...params }: LiveResearchOptions) {
  const query = params.query.trim();
  const active = enabled && query.length >= LIVE_SEARCH_MIN_LENGTH;

  const result = useQuery({
    queryKey: [
      'notebook-live-research',
      notebookId ?? params.collectionIds ?? null,
      query,
      params.filters ?? null,
      params.mode ?? null,
      params.sortBy ?? null,
    ],
    queryFn: () => fetchResearch({ ...params, query }, notebookId),
    enabled: active,
    // Keeps the previous hits on screen between keystrokes instead of flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  return {
    results: active ? (result.data?.results ?? []) : [],
    metadata: active ? (result.data?.metadata ?? null) : null,
    isFetching: active && result.isFetching,
    /** No answer at all yet for this search (first request in flight). */
    isPending: active && result.isPending,
    isError: active && result.isError,
  };
}
