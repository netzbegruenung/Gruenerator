import {
  GLOBAL_SEARCH_MAX_QUERY_LENGTH,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  type OfficeSearchItem,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 250;
const EMPTY: OfficeSearchItem[] = [];

async function fetchOfficeSearch(q: string): Promise<OfficeSearchItem[]> {
  const result = await getContractsClient().globalSearch.officeSearch({ query: { q } });
  if (result.status !== 200) throw new ApiError(result.status, 'Suche fehlgeschlagen');
  return result.body.items;
}

/**
 * Docs, sheets, presentations and boards whose title OR body matches — the
 * same endpoint web's Arbeiten composer searches with. Debounced, and quiet
 * below the contract's minimum length (the endpoint would reject it).
 */
export function useOfficeSearch(input: string) {
  const trimmed = input.trim();
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const sent = debounced.slice(0, GLOBAL_SEARCH_MAX_QUERY_LENGTH);
  const active = sent.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['office-search', sent],
    queryFn: () => fetchOfficeSearch(sent),
    enabled: active,
    // The last result stays up between keystrokes instead of flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    items: active ? (query.data ?? EMPTY) : EMPTY,
    active,
    /** True while the current input has no answer yet. */
    isSearching: active && (query.isFetching || debounced !== trimmed),
    isError: active && query.isError,
  };
}
