import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import apiClient from '../../components/utils/apiClient';

export type SearchMode = 'hybrid' | 'vector' | 'text';
export type SortOption = 'relevance' | 'date_desc' | 'date_asc';

export interface CollectionInfo {
  id: string;
  name: string;
  description: string;
  filterableFields: string[];
}

export interface FilterFieldConfig {
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  min?: string;
  max?: string;
}

export type ActiveFilters = Record<string, string[] | { date_from?: string; date_to?: string }>;

interface FiltersResponse {
  filters: Record<string, FilterFieldConfig>;
}

const ALLOWED_FILTER_FIELDS = new Set(['published_at', 'content_type']);

export function useResearchFilters() {
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');

  // Whether the filter popover is open — filters are only fetched when true
  const [filtersEnabled, setFiltersEnabled] = useState(false);

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['research', 'collections'],
    queryFn: () => apiClient.get<CollectionInfo[]>('/research/collections').then((r) => r.data),
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
    queryFn: () => {
      const params = selectedCollectionIds.length
        ? `?collectionIds=${selectedCollectionIds.join(',')}`
        : '';
      return apiClient
        .get<FiltersResponse>(`/research/filters${params}`)
        .then((r) => r.data.filters);
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
