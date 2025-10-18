import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANTRAEGE_TYPES,
  DEFAULT_GALLERY_TYPE,
  GENERATOR_TYPES,
  GALLERY_CONTENT_TYPES,
  ORDERED_CONTENT_TYPE_IDS,
  PR_TYPES
} from './config';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const DEBOUNCE_DELAY = 500;

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unbekannter Fehler' }));
    throw new Error(error.message || 'Fehler beim Laden der Daten');
  }

  return response.json();
};

const buildUrl = (path) => {
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

const fetchAntraege = async ({ searchTerm, searchMode, selectedCategory, signal }) => {
  const params = new URLSearchParams();
  if (searchTerm) {
    params.append('searchTerm', searchTerm);
    if (searchMode) params.append('searchMode', searchMode);
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.append('categoryId', selectedCategory);
  }

  const url = buildUrl(`/auth/antraege${params.toString() ? `?${params.toString()}` : ''}`);
  const data = await fetchJson(url, { method: 'GET', signal });
  return Array.isArray(data?.antraege) ? data.antraege : [];
};

const fetchGenerators = async ({ searchTerm, selectedCategory, signal }) => {
  const params = new URLSearchParams();
  if (searchTerm) params.append('searchTerm', searchTerm);
  if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);

  const url = buildUrl(`/auth/custom-generators${params.toString() ? `?${params.toString()}` : ''}`);
  const data = await fetchJson(url, { method: 'GET', signal });
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

  const url = buildUrl('/auth/examples/similar');
  const payload = {
    query: String(searchTerm).trim(),
    limit: 200,
    ...(typeParam ? { type: typeParam } : {})
  };

  const data = await fetchJson(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal
  });

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

  const params = new URLSearchParams();
  if (searchTerm) {
    params.append('searchTerm', searchTerm);
    if (searchMode) params.append('searchMode', searchMode);
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.append('category', selectedCategory);
  }
  if (Array.isArray(filterTypes) && filterTypes.length > 0) {
    params.append('types', filterTypes.join(','));
  }

  params.append('onlyExamples', 'true');
  params.append('status', 'published');
  params.append('limit', '200');

  const url = buildUrl(`/auth/database?${params.toString()}`);
  const data = await fetchJson(url, { method: 'GET', signal });
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

const categoryQueryOptions = {
  antraege: {
    queryKey: ['antraegeCategories'],
    queryFn: async () => {
      const url = buildUrl('/auth/antraege-categories');
      const data = await fetchJson(url, { method: 'GET' });
      const categories = Array.isArray(data?.categories) ? data.categories : [];
      return [{ id: 'all', label: 'Alle Kategorien' }, ...categories];
    }
  }
};

const fetcherMap = {
  fetchAntraege: fetchAntraege,
  fetchGenerators: fetchGenerators,
  fetchUnified: fetchUnified
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
    ...categoryQueryOptions.antraege,
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

      const items = await fetcher({
        searchTerm,
        searchMode,
        selectedCategory,
        contentType: resolvedType,
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
    isFetching: dataQuery.isFetching
  };
};
