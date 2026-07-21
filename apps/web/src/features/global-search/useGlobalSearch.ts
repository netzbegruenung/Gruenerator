import { type GlobalSearchResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import useDebounce from '../../components/hooks/useDebounce';

export const MIN_QUERY_LENGTH = 2;

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
  const active = enabled && debounced.length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => fetchGlobalSearch(debounced),
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
