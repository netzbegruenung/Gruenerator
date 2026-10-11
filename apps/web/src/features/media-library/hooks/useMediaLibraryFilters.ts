import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { MediaType, SortOrder } from '@gruenerator/shared/media-library';

export type MediaTypeFilter = MediaType | 'all';

const SEARCH_DEBOUNCE_MS = 400;
const TYPES: readonly MediaTypeFilter[] = ['all', 'image', 'video', 'audio'];

export interface MediaLibraryFilters {
  type: MediaTypeFilter;
  sort: SortOrder;
  /** What is typed right now — drives the search field and the chip. */
  searchInput: string;
  /** {@link searchInput} after the debounce — drives the query. */
  search: string;
  setType: (type: MediaTypeFilter) => void;
  setSort: (sort: SortOrder) => void;
  setSearchInput: (value: string) => void;
  reset: () => void;
  /** Anything narrower than „all media, newest first". */
  isFiltered: boolean;
}

/**
 * Type, sort and search of the Mediathek. Type and sort live in the address
 * (`?typ=`, `?sort=`) so a filtered view can be linked and survives reload;
 * the search is typed state with a debounce.
 */
export function useMediaLibraryFilters(): MediaLibraryFilters {
  const [params, setParams] = useSearchParams();
  const typeParam = params.get('typ') as MediaTypeFilter | null;
  const type = typeParam && TYPES.includes(typeParam) ? typeParam : 'all';
  const sort: SortOrder = params.get('sort') === 'oldest' ? 'oldest' : 'newest';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const setType = useCallback(
    (value: MediaTypeFilter) => setParam('typ', value === 'all' ? null : value),
    [setParam]
  );
  const setSort = useCallback(
    (value: SortOrder) => setParam('sort', value === 'newest' ? null : value),
    [setParam]
  );
  const reset = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('typ');
        next.delete('sort');
        return next;
      },
      { replace: true }
    );
  }, [setParams]);

  return {
    type,
    sort,
    searchInput,
    search,
    setType,
    setSort,
    setSearchInput,
    reset,
    isFiltered: type !== 'all' || sort !== 'newest' || searchInput.trim() !== '',
  };
}
