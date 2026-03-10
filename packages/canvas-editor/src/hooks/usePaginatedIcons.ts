import { useState, useMemo, useCallback, useEffect } from 'react';

import { ALL_ICONS, type IconDef } from '../utils/canvasIcons';

const PAGE_SIZE = 32;

interface UsePaginatedIconsReturn {
  visibleIcons: IconDef[];
  hasMore: boolean;
  loadMore: () => void;
  totalCount: number;
  loadedCount: number;
}

export function usePaginatedIcons(isExpanded: boolean): UsePaginatedIconsReturn {
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!isExpanded) {
      setLoadedCount(PAGE_SIZE);
    }
  }, [isExpanded]);

  const visibleIcons = useMemo(() => {
    if (!isExpanded) return [];
    return ALL_ICONS.slice(0, loadedCount);
  }, [isExpanded, loadedCount]);

  const hasMore = loadedCount < ALL_ICONS.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setLoadedCount((prev) => Math.min(prev + PAGE_SIZE, ALL_ICONS.length));
    }
  }, [hasMore]);

  return {
    visibleIcons,
    hasMore,
    loadMore,
    totalCount: ALL_ICONS.length,
    loadedCount,
  };
}
