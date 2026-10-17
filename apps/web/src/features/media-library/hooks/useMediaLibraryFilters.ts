import { mediathekFilterSchema, type MediathekFilter } from '@gruenerator/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortOrder } from '@gruenerator/shared/media-library';

export type MediaTypeFilter = MediathekFilter;

const SEARCH_DEBOUNCE_MS = 400;

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
  const type = mediathekFilterSchema.catch('all').parse(params.get('typ'));
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
