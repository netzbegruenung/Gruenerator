import { useState, useMemo, useCallback, useEffect } from 'react';

import { UNDRAW_FEATURED } from '../utils/illustrations/undraw';
import { KAWAII_ILLUSTRATIONS } from '../utils/illustrations/kawaii';
import { OPENDOODLES } from '../utils/illustrations/opendoodles';

import type { IllustrationDef } from '../utils/illustrations/types';

const PAGE_SIZE = 32;

/** Curated "recommended" set shown when collapsed (kawaii + opendoodles + featured undraw) */
const RECOMMENDED: IllustrationDef[] = [
  ...KAWAII_ILLUSTRATIONS,
  ...OPENDOODLES.slice(0, 4),
  ...UNDRAW_FEATURED.slice(0, 4),
];

interface UsePaginatedIllustrationsReturn {
  visibleIllustrations: IllustrationDef[];
  hasMore: boolean;
  loadMore: () => void;
  totalCount: number;
  loadedCount: number;
}

export function usePaginatedIllustrations(
  allIllustrations: IllustrationDef[],
  isExpanded: boolean
): UsePaginatedIllustrationsReturn {
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!isExpanded) {
      setLoadedCount(PAGE_SIZE);
    }
  }, [isExpanded]);

  const visibleIllustrations = useMemo(() => {
    if (!isExpanded) return RECOMMENDED;
    return allIllustrations.slice(0, loadedCount);
  }, [isExpanded, loadedCount, allIllustrations]);

  const hasMore = isExpanded && loadedCount < allIllustrations.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setLoadedCount((prev) => Math.min(prev + PAGE_SIZE, allIllustrations.length));
    }
  }, [hasMore, allIllustrations.length]);

  return {
    visibleIllustrations,
    hasMore,
    loadMore,
    totalCount: allIllustrations.length,
    loadedCount,
  };
}
