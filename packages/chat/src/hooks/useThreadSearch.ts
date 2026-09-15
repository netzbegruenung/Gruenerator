import {
  GLOBAL_SEARCH_MAX_QUERY_LENGTH,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  type ThreadSearchItem,
  type ThreadSearchResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useDebounce } from './useDebounce';

export const THREAD_SEARCH_MIN_QUERY_LENGTH = GLOBAL_SEARCH_MIN_QUERY_LENGTH;

const DEBOUNCE_MS = 250;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Section heading for a hit, from the timestamp of the matched MESSAGE — not
 * the thread's `updated_at`. The server orders by `m.created_at DESC`, so
 * bucketing on the match makes the sections come out monotonically; bucketing
 * on the thread would interleave (a chat bumped today whose hit is from March
 * would put "Älter" above "Heute").
 */
export function bucketLabel(matchedAt: string, now: Date = new Date()): string {
  const matched = new Date(matchedAt);
  if (Number.isNaN(matched.getTime())) return 'Älter';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const matchedTime = matched.getTime();

  if (matchedTime >= startOfToday) return 'Heute';
  if (matchedTime >= startOfToday - 6 * DAY_MS) return 'Diese Woche';
  return 'Älter';
}

async function fetchThreadSearch(query: string): Promise<ThreadSearchResponse> {
  const result = await getContractsClient().globalSearch.threadSearch({ query: { q: query } });
  if (result.status !== 200) {
    throw new Error('Suche fehlgeschlagen');
  }
  return result.body;
}

export function useThreadSearch(input: string) {
  const debounced = useDebounce(input.trim(), DEBOUNCE_MS);
  // A pasted wall of text is still a legitimate search intent, so clamp rather
  // than skip — the contract rejects anything longer outright.
  const sent = debounced.slice(0, GLOBAL_SEARCH_MAX_QUERY_LENGTH);
  const active = sent.length >= THREAD_SEARCH_MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['thread-search', sent],
    queryFn: () => fetchThreadSearch(sent),
    enabled: active,
    // Keeps the previous result on screen between keystrokes instead of
    // flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const items: ThreadSearchItem[] = active ? (query.data?.items ?? []) : [];

  return {
    items,
    isError: query.isError,
    /** True while the *current* input has no server answer yet. */
    isSearching: active && (query.isFetching || debounced !== input.trim()),
  };
}
