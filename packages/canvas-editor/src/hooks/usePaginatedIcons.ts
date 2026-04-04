import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import { loadAllIcons, getIconsSync, searchIcons, type IconDef } from '../utils/canvasIcons';

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
  const [allIcons, setAllIcons] = useState<IconDef[]>(() => getIconsSync() ?? []);
  const [isLoading, setIsLoading] = useState(!getIconsSync());

  // Search state
  const [searchResults, setSearchResults] = useState<IconDef[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Load all icons metadata on mount
  useEffect(() => {
    if (getIconsSync()) return;
    let cancelled = false;
    loadAllIcons().then((icons) => {
      if (!cancelled) {
        setAllIcons(icons);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced API search
  const hasSearch = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!hasSearch) {
      setSearchResults([]);
      setSearchTotal(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        const result = await searchIcons(searchQuery.trim(), 64);
        if (!controller.signal.aborted) {
          setSearchResults(result.icons);
          setSearchTotal(result.total);
          setIsSearching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchTotal(0);
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [hasSearch, searchQuery]);

  // Reset pagination when collapsing
  useEffect(() => {
    if (!isExpanded) {
      setLoadedCount(PAGE_SIZE);
    }
  }, [isExpanded]);

  const visibleIcons = useMemo(() => {
    if (hasSearch) return searchResults;
    if (!isExpanded) return [];
    return allIcons.slice(0, loadedCount);
  }, [hasSearch, searchResults, isExpanded, loadedCount, allIcons]);

  const totalCount = hasSearch ? searchTotal : allIcons.length;
  const hasMore = hasSearch ? false : loadedCount < allIcons.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setLoadedCount((prev) => Math.min(prev + PAGE_SIZE, allIcons.length));
    }
  }, [hasMore, allIcons.length]);

  return {
    visibleIcons,
    hasMore,
    loadMore,
    totalCount,
    loadedCount: hasSearch ? searchResults.length : loadedCount,
    isLoading: isLoading || isSearching,
  };
}
