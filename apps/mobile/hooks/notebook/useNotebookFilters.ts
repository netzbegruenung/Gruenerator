import { useResearchFacets } from '@gruenerator/shared/hooks';
import { type ResearchFacetVocabulary } from '@gruenerator/shared/utils';
import { useMemo } from 'react';

import { getResearchCollectionIds } from '../../config/notebooksConfig';
import { DEV_AUTH_BYPASS } from '../../services/devAuth';
import { DEV_RESEARCH_FACETS } from '../../services/devResearchFixture';

export interface FilterFieldValues {
  field: string;
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  valueLabels?: Record<string, string>;
  /** Behind „Weitere Filter“ instead of offered directly. */
  collapsed?: boolean;
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
  // The emulator's dev login cannot load the vocabulary; placeholder facets
  // stand in so the options sheet can be looked at.
  const data = DEV_AUTH_BYPASS && query.isError ? DEV_RESEARCH_FACETS : query.data;
  const facets = data ?? NO_FACETS;

  const filterFields = useMemo(
    (): FilterFieldValues[] =>
      Object.entries(data ?? {}).map(([field, e]) => ({
        field,
        label: e.label ?? field,
        type: e.type === 'date_range' ? 'date_range' : 'keyword',
        ...(e.values && { values: e.values }),
        ...(e.valueLabels && { valueLabels: e.valueLabels }),
        ...(e.collapsed && { collapsed: true }),
      })),
    [data]
  );

  return { facets, filterFields, isLoading: query.isLoading };
}
