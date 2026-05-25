import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import { getResearchCollectionIds } from '../../config/notebooksConfig';

export interface FilterFieldValues {
  field: string;
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
}

interface FilterEntryRaw {
  label?: string;
  type?: string;
  values?: Array<{ value: string; count: number }>;
}

interface FiltersApiResponse {
  filters?: Record<string, FilterEntryRaw>;
}

/**
 * Keyword/date facets for a system notebook, merged across its `*-system` collections.
 * Disabled for user notebooks (the per-notebook research endpoint has no facets).
 */
export function useNotebookFilters(notebookId: string, kind: 'system' | 'user') {
  const collectionIds = getResearchCollectionIds(notebookId);
  const ids = collectionIds.join(',');

  const query = useQuery({
    queryKey: ['notebook', notebookId, 'research-filters', ids],
    enabled: kind === 'system' && collectionIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FilterFieldValues[]> => {
      const res = await getGlobalApiClient().get<FiltersApiResponse>(
        `/research/filters?collectionIds=${ids}`
      );
      const filtersObj = res.data.filters ?? {};
      return Object.entries(filtersObj).map(([field, e]) => ({
        field,
        label: e.label ?? field,
        type: (e.type ?? 'keyword') as 'keyword' | 'date_range',
        values: e.values,
      }));
    },
  });

  return {
    filterFields: query.data ?? [],
    isLoading: query.isLoading,
  };
}
