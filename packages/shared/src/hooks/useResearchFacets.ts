import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchResearchFacets, researchFacetsQueryKey } from '../api/researchSearch.js';

/**
 * The facet vocabulary of a set of system collections, for the filter menus
 * and the query parser (`parseResearchIntent` only recognises themes and
 * persons the collections actually carry). Cached for ten minutes.
 */
export function useResearchFacets({
  collectionIds,
  enabled,
}: {
  collectionIds: readonly string[];
  enabled: boolean;
}) {
  return useQuery({
    queryKey: researchFacetsQueryKey(collectionIds),
    queryFn: () => fetchResearchFacets(collectionIds),
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled,
  });
}
