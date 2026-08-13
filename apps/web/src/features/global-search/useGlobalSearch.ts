import {
  GLOBAL_SEARCH_MAX_QUERY_LENGTH,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  type GlobalSearchResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import useDebounce from '../../components/hooks/useDebounce';

export const MIN_QUERY_LENGTH = GLOBAL_SEARCH_MIN_QUERY_LENGTH;

const DEBOUNCE_MS = 250;

async function fetchGlobalSearch(query: string): Promise<GlobalSearchResponse> {
  const result = await getContractsClient().globalSearch.search({ query: { q: query } });
  if (result.status !== 200) {
    throw new Error('Suche fehlgeschlagen');
  }
  return result.body;
}

export function useGlobalSearch(input: string, enabled = true) {
  const debounced = useDebounce(input.trim(), DEBOUNCE_MS);
  // A pasted wall of text is still a legitimate search intent here, so clamp
  // rather than skip — the contract rejects anything longer outright.
  const sent = debounced.slice(0, GLOBAL_SEARCH_MAX_QUERY_LENGTH);
  const active = enabled && sent.length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['global-search', sent],
    queryFn: () => fetchGlobalSearch(sent),
    enabled: active,
    // Keeps the previous result on screen between keystrokes instead of
    // flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    /** True while the *current* input has no server answer yet. */
    isSearching: active && (query.isFetching || debounced !== input.trim()),
    debouncedQuery: debounced,
  };
}
