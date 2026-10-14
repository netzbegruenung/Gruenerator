import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useResearchFacets } from '@gruenerator/shared/hooks';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  type ActiveFilters,
} from '@gruenerator/shared/utils';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

export type SearchMode = 'hybrid' | 'vector' | 'text';
export type SortOption = 'relevance' | 'date_desc' | 'date_asc';

export interface FilterFieldConfig {
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  /** Maps raw facet values to display labels (e.g. theme code → German name). */
  valueLabels?: Record<string, string>;
  min?: string;
  max?: string;
  /** Behind „Weitere Filter“ instead of offered directly. */
  collapsed?: boolean;
}

// Only fields with a manual UI and reliable population. Dropped 2026-07:
// `region` is never written to any Qdrant payload (dead facet); `content_type`
// /`primary_category`/`subcategories` have no manual UI and no NL-parser path,
// so surfacing them here only fed phantom filters.
const ALLOWED_FILTER_FIELDS = new Set([
  'published_at',
  // NLP-enriched per-document facets
  'themes',
  'persons',
]);

export function useResearchFilters(initialCollectionIds: string[] = []) {
  const [selectedCollectionIds, setSelectedCollectionIds] =
    useState<string[]>(initialCollectionIds);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');

  // Whether the filter popover is open — filters are only fetched when true
  const [filtersEnabled, setFiltersEnabled] = useState(false);

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['research', 'collections'],
    queryFn: async () => {
      const result = await getContractsClient().research.collections();
      if (result.status !== 200) {
        throw new ApiError(
          result.status,
          `Failed to load research collections (HTTP ${result.status})`
        );
      }
      return result.body;
    },
    staleTime: 30 * 60 * 1000,
  });

  const facets = useResearchFacets({
    collectionIds: selectedCollectionIds,
    enabled: filtersEnabled,
  });
  // Boundary cast: the contract types `type` as `string` (shared schema),
  // but the backend only ever emits 'keyword' | 'date_range'.
  const filterFields = useMemo(
    () => (facets.data ?? {}) as Record<string, FilterFieldConfig>,
    [facets.data]
  );
  const {
    isLoading: filtersLoading,
    isFetching: filtersFetching,
    isFetched: filtersFetched,
  } = facets;

  const allowedFilterFields = useMemo(() => {
    const result: Record<string, FilterFieldConfig> = {};
    for (const [key, value] of Object.entries(filterFields)) {
      if (ALLOWED_FILTER_FIELDS.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }, [filterFields]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const value of Object.values(activeFilters)) {
      if (Array.isArray(value)) {
        count += value.length;
      } else if (value.date_from || value.date_to) {
        count += 1;
      }
    }
    return count;
  }, [activeFilters]);

  const toggleFilter = useCallback((field: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[field];
      const values = Array.isArray(current) ? current : [];
      const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
  }, []);

  const setDateFilter = useCallback((field: string, dateFrom?: string, dateTo?: string) => {
    setActiveFilters((prev) => {
      if (!dateFrom && !dateTo) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: { date_from: dateFrom, date_to: dateTo } };
    });
  }, []);

  const clearFilter = useCallback((field: string) => {
    setActiveFilters((prev) => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const setKeywordFilter = useCallback((field: string, values: string[]) => {
    setActiveFilters((prev) => {
      if (values.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: values };
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters({});
  }, []);

  /**
   * Union a batch of parsed filters (from the NL query parser) into the active
   * set — keyword facets add to the user's selections, date ranges replace.
   * Idempotent: re-applying identical filters returns the same reference so the
   * debounced re-search effect in the consumer doesn't loop.
   */
  const applyParsedFilters = useCallback((next: ActiveFilters, nextSortBy?: SortOption) => {
    if (Object.keys(next).length > 0) {
      setActiveFilters((prev) => {
        const merged = mergeParsedFilters(prev, next);
        return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
      });
    }
    if (nextSortBy) setSortBy(nextSortBy);
  }, []);

  const removeFilterValue = useCallback((field: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[field];
      if (!Array.isArray(current)) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      const next = current.filter((v) => v !== value);
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
  }, []);

  const buildApiFilters = useCallback((): Record<string, unknown> | undefined => {
    if (activeFilterCount === 0) return undefined;
    return activeFiltersToApi(activeFilters);
  }, [activeFilters, activeFilterCount]);

  return {
    collections,
    collectionsLoading,
    selectedCollectionIds,
    setSelectedCollectionIds,
    filterFields: allowedFilterFields,
    filtersLoading: filtersLoading || filtersFetching,
    /** The vocabulary has been asked for at least once (answered or failed). */
    filtersFetched,
    filtersEnabled,
    setFiltersEnabled,
    activeFilters,
    activeFilterCount,
    toggleFilter,
    setKeywordFilter,
    setDateFilter,
    clearFilter,
    clearAllFilters,
    applyParsedFilters,
    removeFilterValue,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
    buildApiFilters,
  };
}
