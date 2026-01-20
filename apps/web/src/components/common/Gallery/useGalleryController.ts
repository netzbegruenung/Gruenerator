import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANTRAEGE_TYPES,
  DEFAULT_GALLERY_TYPE,
  GENERATOR_TYPES,
  GALLERY_CONTENT_TYPES,
  ORDERED_CONTENT_TYPE_IDS,
  PR_TYPES
} from './config';
import { parseSearchQuery, addTagToSearch } from './searchUtils';
import apiClient from '../../utils/apiClient';

const DEBOUNCE_DELAY = 500;

interface FetchOptions {
  searchTerm?: string;
  searchMode?: string;
  selectedCategory?: string;
  signal?: AbortSignal;
  contentType?: string;
  filterTypes?: string[];
  sectionOrder?: string[];
  sectionTypeMap?: Record<string, string[]>;
  tags?: string[];
}

const fetchAntraege = async ({ searchTerm, searchMode, selectedCategory, signal }: FetchOptions) => {
  const params: Record<string, unknown> = {};
  if (searchTerm) {
    params.searchTerm = searchTerm;
    if (searchMode) params.searchMode = searchMode;
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.categoryId = selectedCategory;
  }

  const response = await apiClient.get('/auth/antraege', { params, signal });
  const data = response.data;
  return Array.isArray(data?.antraege) ? data.antraege : [];
};

const fetchGenerators = async ({ searchTerm, selectedCategory, signal }: FetchOptions) => {
  const params: Record<string, unknown> = {};
  if (searchTerm) params.searchTerm = searchTerm;
  if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;

  const response = await apiClient.get('/auth/custom-generators', { params, signal });
  const data = response.data;
  if (Array.isArray(data?.generators)) return data.generators;
  if (Array.isArray(data)) return data;
  return [];
};

const fetchSemanticResults = async ({ searchTerm, contentType, selectedCategory, signal }: FetchOptions) => {
  if (!searchTerm) return [];

  let typeParam: string | undefined;
  if (contentType === 'pr') {
    const allowed = new Set(PR_TYPES);
    if (selectedCategory && selectedCategory !== 'all' && allowed.has(selectedCategory)) {
      typeParam = selectedCategory;
    }
  } else if (contentType === 'generators') {
    typeParam = 'template';
  }

  const payload: Record<string, unknown> = {
    query: String(searchTerm).trim(),
    limit: 200,
    ...(typeParam ? { type: typeParam } : {})
  };

  const response = await apiClient.post('/auth/examples/similar', payload, { signal });
  const data = response.data;

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
};

const fetchUnified = async ({ searchTerm, searchMode, selectedCategory, contentType, signal, filterTypes, sectionOrder, sectionTypeMap }: FetchOptions) => {
  if (searchMode === 'semantic' && searchTerm) {
    return {
      items: await fetchSemanticResults({ searchTerm, contentType, selectedCategory, signal })
    };
  }

  const params: Record<string, unknown> = {
    onlyExamples: 'true',
    status: 'published',
    limit: '200'
  };
  if (searchTerm) {
    params.searchTerm = searchTerm;
    if (searchMode) params.searchMode = searchMode;
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.category = selectedCategory;
  }
  if (Array.isArray(filterTypes) && filterTypes.length > 0) {
    params.types = filterTypes.join(',');
  }

  const response = await apiClient.get('/auth/database', { params, signal });
  const data = response.data;
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  if (!Array.isArray(sectionOrder) || !sectionTypeMap) {
    if (Array.isArray(filterTypes) && filterTypes.length > 0) {
      const allowed = new Set(filterTypes);
      return { items: list.filter((item: Record<string, unknown>) => allowed.has(item.type as string)) };
    }
    return { items: list };
  }

  const sections = sectionOrder.reduce((acc: Record<string, unknown>, key: string) => {
    const allowed = new Set(sectionTypeMap[key] || []);
    acc[key] = list.filter((item: Record<string, unknown>) => allowed.has(item.type as string));
    return acc;
  }, {});

  return { items: list, sections };
};

const fetchVorlagen = async ({ searchTerm, searchMode, selectedCategory, tags, signal }: FetchOptions) => {
  const params: Record<string, unknown> = {};
  if (searchTerm) {
    params.searchTerm = searchTerm;
    if (searchMode) params.searchMode = searchMode;
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.templateType = selectedCategory;
  }
  if (Array.isArray(tags) && tags.length > 0) {
    params.tags = JSON.stringify(tags);
  }

  const response = await apiClient.get('/auth/vorlagen', { params, signal });
  const data = response.data;
  return Array.isArray(data?.vorlagen) ? data.vorlagen : [];
};

const fetchPublicPrompts = async ({ searchTerm, searchMode, signal }: FetchOptions) => {
  const params: Record<string, unknown> = { limit: 50 };
  if (searchTerm) {
    params.searchTerm = searchTerm;
    if (searchMode) params.searchMode = searchMode;
  }

  const response = await apiClient.get('/auth/public_prompts', { params, signal });
  const data = response.data;
  return Array.isArray(data?.results) ? data.results : [];
};

const categoryQueryOptions = {
  antraege: {
    queryKey: ['antraegeCategories'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/antraege-categories');
      const data = response.data;
      const categories = Array.isArray(data?.categories) ? data.categories : [];
      return [{ id: 'all', label: 'Alle Kategorien' }, ...categories];
    }
  },
  vorlagen: {
    queryKey: ['vorlagenCategories'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/vorlagen-categories');
      const data = response.data;
      const categories = Array.isArray(data?.categories) ? data.categories : [];
      return [{ id: 'all', label: 'Alle Typen' }, ...categories];
    }
  }
};

const fetcherMap = {
  fetchAntraege: fetchAntraege,
  fetchGenerators: fetchGenerators,
  fetchUnified: fetchUnified,
  fetchVorlagen: fetchVorlagen,
  fetchPublicPrompts: fetchPublicPrompts
};

interface UseGalleryControllerProps {
  contentType: string;
  availableContentTypeIds?: string[];
}

export const useGalleryController = ({
  contentType,
  availableContentTypeIds = ORDERED_CONTENT_TYPE_IDS
}: UseGalleryControllerProps) => {
  const resolvedType = GALLERY_CONTENT_TYPES[contentType] ? contentType : DEFAULT_GALLERY_TYPE;
  const config = GALLERY_CONTENT_TYPES[resolvedType];

  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState(config.defaultSearchMode || config.searchModes?.[0]?.value || 'title');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const mode = config.defaultSearchMode || config.searchModes?.[0]?.value || 'title';
    setSearchMode(mode);
    setSelectedCategory('all');
    setInputValue('');
    setSearchTerm('');
  }, [resolvedType, config.defaultSearchMode, config.searchModes]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(inputValue);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(handler);
  }, [inputValue]);

  const categoriesQuery = useQuery({
    ...(categoryQueryOptions[resolvedType as keyof typeof categoryQueryOptions] || categoryQueryOptions.antraege),
    enabled: config.categorySource?.type === 'api'
  });

  const dataQuery = useQuery({
    queryKey: [
      'gallery-data',
      resolvedType,
      searchTerm,
      searchMode,
      selectedCategory
    ],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: async ({ signal }): Promise<Record<string, unknown>> => {
      const fetcherName = config.fetcher;
      const fetcher = fetcherMap[fetcherName as keyof typeof fetcherMap];
      if (!fetcher) return { items: [] };

      if (fetcherName === 'fetchUnified') {
        return fetcher({
          searchTerm,
          searchMode,
          selectedCategory,
          contentType: resolvedType,
          signal,
          filterTypes: config.filterTypes,
          sectionOrder: config.sectionOrder,
          sectionTypeMap: config.sectionTypeMap
        });
      }

      // For vorlagen, parse hashtags from search term
      let effectiveSearchTerm = searchTerm;
      let tags: string[] = [];
      if (fetcherName === 'fetchVorlagen') {
        const parsed = parseSearchQuery(searchTerm);
        effectiveSearchTerm = parsed.textQuery;
        tags = parsed.tags;
      }

      const items = await fetcher({
        searchTerm: effectiveSearchTerm,
        searchMode,
        selectedCategory,
        contentType: resolvedType,
        tags,
        signal
      });

      return { items };
    },
    placeholderData: (previousData) => previousData
  });

  const baseCategories = useMemo(() => {
    if (config.categorySource?.type === 'static') {
      return config.categorySource.categories;
    }

    if (config.categorySource?.type === 'api') {
      return categoriesQuery.data;
    }

    if (config.allowCategoryFilter === false) return [];
    const sourceItems = (dataQuery.data as Record<string, unknown>)?.items as unknown[] || [];
    const categorySet = new Set<string>();
    sourceItems.forEach((item: unknown) => {
      const itemObj = item as Record<string, unknown>;
      const categories = Array.isArray(itemObj.categories) ? itemObj.categories : [];
      categories.forEach((category: unknown) => {
        if (category) categorySet.add(String(category));
      });
    });

    return ['all', ...Array.from(categorySet).sort()].map((value) => (
      value === 'all'
        ? { id: 'all', label: 'Alle Kategorien' }
        : { id: value, label: value }
    ));
  }, [config.categorySource, config.allowCategoryFilter, dataQuery.data, categoriesQuery.data]);

  useEffect(() => {
    if (!Array.isArray(baseCategories) || baseCategories.length === 0) return;
    const exists = baseCategories.some((category) => category.id === selectedCategory);
    if (!exists) {
      setSelectedCategory('all');
    }
  }, [baseCategories, selectedCategory]);

  const typeOptions = useMemo(() => (
    availableContentTypeIds
      .map((id) => GALLERY_CONTENT_TYPES[id])
      .filter(Boolean)
  ), [availableContentTypeIds]);

  const handleTagClick = useCallback((tag: string) => {
    setInputValue(addTagToSearch(inputValue, tag));
  }, [inputValue]);

  return {
    config,
    items: ((dataQuery.data as Record<string, unknown>)?.items as unknown[]) || [],
    sections: (dataQuery.data as Record<string, unknown>)?.sections,
    loading: dataQuery.isLoading,
    error: dataQuery.error,
    searchTerm,
    inputValue,
    setInputValue,
    searchMode,
    setSearchMode,
    selectedCategory,
    setSelectedCategory,
    categories: baseCategories,
    contentType: resolvedType,
    typeOptions,
    isFetching: dataQuery.isFetching,
    refetch: dataQuery.refetch,
    handleTagClick
  };
};
