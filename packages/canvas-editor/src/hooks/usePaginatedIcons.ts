import { useState, useMemo, useCallback, useEffect } from 'react';

import { type IconDef } from '../utils/canvasIcons';
import { useDebounce } from './useDebounce';
import { useIconCatalog } from './useIconCatalog';
import { useIconSearch } from './useIconSearch';

const PAGE_SIZE = 32;
const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedIconsReturn {
  visibleIcons: IconDef[];
  hasMore: boolean;
  loadMore: () => void;
  totalCount: number;
  loadedCount: number;
  isLoading: boolean;
}

export function usePaginatedIcons(
  isExpanded: boolean,
  searchQuery: string = ''
): UsePaginatedIconsReturn {
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  const catalog = useIconCatalog();
  const allIcons = catalog.data ?? [];

  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const hasSearch = debouncedQuery.trim().length > 0;
  const search = useIconSearch(debouncedQuery);

  useEffect(() => {
    if (!isExpanded) {
      setLoadedCount(PAGE_SIZE);
    }
  }, [isExpanded]);

  const visibleIcons = useMemo(() => {
    if (hasSearch) return search.data?.icons ?? [];
    if (!isExpanded) return [];
    return allIcons.slice(0, loadedCount);
  }, [hasSearch, search.data, isExpanded, loadedCount, allIcons]);

  const totalCount = hasSearch ? (search.data?.total ?? 0) : allIcons.length;
  const hasMore = hasSearch ? false : loadedCount < allIcons.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setLoadedCount((prev) => Math.min(prev + PAGE_SIZE, allIcons.length));
    }
  }, [hasMore, allIcons.length]);

  const isLoading = hasSearch
    ? search.isFetching
    : catalog.isLoading || (catalog.isFetching && allIcons.length === 0);

  return {
    visibleIcons,
    hasMore,
    loadMore,
    totalCount,
    loadedCount: hasSearch ? visibleIcons.length : loadedCount,
    isLoading,
  };
}
