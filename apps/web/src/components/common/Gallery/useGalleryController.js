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

const fetchAntraege = async ({ searchTerm, searchMode, selectedCategory, signal }) => {
  const params = {};
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

const fetchGenerators = async ({ searchTerm, selectedCategory, signal }) => {
  const params = {};
  if (searchTerm) params.searchTerm = searchTerm;
  if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;

  const response = await apiClient.get('/auth/custom-generators', { params, signal });
  const data = response.data;
  if (Array.isArray(data?.generators)) return data.generators;
  if (Array.isArray(data)) return data;
  return [];
};

const fetchSemanticResults = async ({ searchTerm, contentType, selectedCategory, signal }) => {
  if (!searchTerm) return [];

  let typeParam;
  if (contentType === 'pr') {
    const allowed = new Set(PR_TYPES);
    if (selectedCategory && selectedCategory !== 'all' && allowed.has(selectedCategory)) {
      typeParam = selectedCategory;
    }
  } else if (contentType === 'generators') {
    typeParam = 'template';
  }

  const payload = {
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

const fetchUnified = async ({ searchTerm, searchMode, selectedCategory, contentType, signal, filterTypes, sectionOrder, sectionTypeMap }) => {
  if (searchMode === 'semantic' && searchTerm) {
    return {
      items: await fetchSemanticResults({ searchTerm, contentType, selectedCategory, signal })
    };
  }

  const params = {
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
      return { items: list.filter((item) => allowed.has(item.type)) };
    }
    return { items: list };
  }

  const sections = sectionOrder.reduce((acc, key) => {
    const allowed = new Set(sectionTypeMap[key] || []);
    acc[key] = list.filter((item) => allowed.has(item.type));
    return acc;
  }, {});

  return { items: list, sections };
};

const fetchVorlagen = async ({ searchTerm, searchMode, selectedCategory, tags, signal }) => {
  const params = {};
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
  fetchVorlagen: fetchVorlagen
};

export const useGalleryController = ({
  contentType,
  availableContentTypeIds = ORDERED_CONTENT_TYPE_IDS
}) => {
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
    ...(categoryQueryOptions[resolvedType] || categoryQueryOptions.antraege),
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
    queryFn: async ({ signal }) => {
      const fetcherName = config.fetcher;
      const fetcher = fetcherMap[fetcherName];
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
      let tags = [];
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
    keepPreviousData: true
  });

  const baseCategories = useMemo(() => {
    if (config.categorySource?.type === 'static') {
      return config.categorySource.categories;
    }

    if (config.categorySource?.type === 'api') {
      return categoriesQuery.data;
    }

    if (config.allowCategoryFilter === false) return [];

    const sourceItems = dataQuery.data?.items || [];
    const categorySet = new Set();
    sourceItems.forEach((item) => {
      const categories = Array.isArray(item.categories) ? item.categories : [];
      categories.forEach((category) => {
        if (category) categorySet.add(category);
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

  const handleTagClick = useCallback((tag) => {
    setInputValue(addTagToSearch(inputValue, tag));
  }, [inputValue]);

  return {
    config,
    items: dataQuery.data?.items || [],
    sections: dataQuery.data?.sections,
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
