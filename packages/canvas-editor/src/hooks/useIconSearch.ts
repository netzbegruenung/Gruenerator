import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { searchIcons, type IconSearchResult } from '../utils/canvasIcons';

const SEARCH_LIMIT = 64;

export function useIconSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<IconSearchResult>({
    queryKey: ['canvas', 'icons', 'search', trimmed] as const,
    queryFn: () => searchIcons(trimmed, SEARCH_LIMIT),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}
