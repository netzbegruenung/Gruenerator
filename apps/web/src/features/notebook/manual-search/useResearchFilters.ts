import { getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
}

export type ActiveFilters = Record<string, string[] | { date_from?: string; date_to?: string }>;

const ALLOWED_FILTER_FIELDS = new Set([
  'published_at',
  'content_type',
  'primary_category',
  'subcategories',
  'region',
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
        throw new Error(`Failed to load research collections (HTTP ${result.status})`);
      }
      return result.body;
    },
    staleTime: 30 * 60 * 1000,
  });

  const collectionsCacheKey = selectedCollectionIds.length
    ? [...selectedCollectionIds].sort().join(',')
    : 'all';

  const {
    data: filterFields = {},
    isLoading: filtersLoading,
    isFetching: filtersFetching,
  } = useQuery({
    queryKey: ['research', 'filters', collectionsCacheKey],
    queryFn: async () => {
      const result = await getContractsClient().research.filters({
        query: {
          collectionIds: selectedCollectionIds.length ? selectedCollectionIds.join(',') : null,
        },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to load research filters (HTTP ${result.status})`);
      }
      // Boundary cast: the contract types `type` as `string` (shared schema),
      // but the backend only ever emits 'keyword' | 'date_range'.
      return result.body.filters as Record<string, FilterFieldConfig>;
    },
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: filtersEnabled,
  });

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

    const result: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(activeFilters)) {
      if (Array.isArray(value) && value.length > 0) {
        result[field] = value;
      } else if (!Array.isArray(value)) {
        // Date range — flatten to top-level date_from/date_to
        if (value.date_from) result.date_from = value.date_from;
        if (value.date_to) result.date_to = value.date_to;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [activeFilters, activeFilterCount]);

  return {
    collections,
    collectionsLoading,
    selectedCollectionIds,
    setSelectedCollectionIds,
    filterFields: allowedFilterFields,
    filtersLoading: filtersLoading || filtersFetching,
    filtersEnabled,
    setFiltersEnabled,
    activeFilters,
    activeFilterCount,
    toggleFilter,
    setKeywordFilter,
    setDateFilter,
    clearFilter,
    clearAllFilters,
    removeFilterValue,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
    buildApiFilters,
  };
}
