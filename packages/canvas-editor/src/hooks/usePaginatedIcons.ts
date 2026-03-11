import { useState, useMemo, useCallback, useEffect } from 'react';

import { loadAllIcons, getIconsSync, type IconDef } from '../utils/canvasIcons';

const PAGE_SIZE = 32;

interface UsePaginatedIconsReturn {
  visibleIcons: IconDef[];
  hasMore: boolean;
  loadMore: () => void;
  totalCount: number;
  loadedCount: number;
  isLoading: boolean;
}

export function usePaginatedIcons(isExpanded: boolean): UsePaginatedIconsReturn {
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [allIcons, setAllIcons] = useState<IconDef[]>(() => getIconsSync() ?? []);
  const [isLoading, setIsLoading] = useState(!getIconsSync());

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

  useEffect(() => {
    if (!isExpanded) {
      setLoadedCount(PAGE_SIZE);
    }
  }, [isExpanded]);

  const visibleIcons = useMemo(() => {
    if (!isExpanded) return [];
    return allIcons.slice(0, loadedCount);
  }, [isExpanded, loadedCount, allIcons]);

  const hasMore = loadedCount < allIcons.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setLoadedCount((prev) => Math.min(prev + PAGE_SIZE, allIcons.length));
    }
  }, [hasMore, allIcons.length]);

  return {
    visibleIcons,
    hasMore,
    loadMore,
    totalCount: allIcons.length,
    loadedCount,
    isLoading,
  };
}
