import { useResearchFacets } from '@gruenerator/shared/hooks';
import { type ResearchFacetVocabulary } from '@gruenerator/shared/utils';
import { useMemo } from 'react';

import { getResearchCollectionIds } from '../../config/notebooksConfig';

export interface FilterFieldValues {
  field: string;
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
}

const NO_FACETS: Record<string, ResearchFacetVocabulary> = {};

/**
 * Keyword/date facets for a system notebook, merged across its `*-system` collections.
 * Disabled for user notebooks (the per-notebook research endpoint has no facets).
 * `facets` is the raw vocabulary the query parser reads.
 */
export function useNotebookFilters(notebookId: string, kind: 'system' | 'user') {
  const collectionIds = getResearchCollectionIds(notebookId);
  const query = useResearchFacets({
    collectionIds,
    enabled: kind === 'system' && collectionIds.length > 0,
  });
  const facets = query.data ?? NO_FACETS;

  const filterFields = useMemo(
    (): FilterFieldValues[] =>
      Object.entries(query.data ?? {}).map(([field, e]) => ({
        field,
        label: e.label ?? field,
        type: e.type === 'date_range' ? 'date_range' : 'keyword',
        ...(e.values && { values: e.values }),
      })),
    [query.data]
  );

  return { facets, filterFields, isLoading: query.isLoading };
}
