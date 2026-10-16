import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useDeferredValue } from 'react';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useDebounce } from '../../../hooks/useDebounce';
import { getIconsSync, loadAllIcons } from '../../../utils/canvasIcons';

import { searchAssetCatalog, type AssetSearchFeatures, type SearchResult } from './assetSearch';

export type { SearchResult, SearchResultType } from './assetSearch';

export interface AssetSearchState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  hasQuery: boolean;
  isTyping: boolean;
  isSearching: boolean;
  showResults: boolean;
  showNoResults: boolean;
  deferredQuery: string;
}

export function useAssetSearch(features: AssetSearchFeatures): AssetSearchState {
  const {
    hasAssetsFeature,
    hasShapesFeature,
    hasChartsFeature,
    hasIconsFeature,
    hasFramesFeature,
  } = features;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const { userLocale = 'de-DE' } = useCanvasEditorServices();

  // Browsing loads sets per-tab; a query, however, should search ALL sets. Load
  // every set once a query is entered, gated so the no-search path stays cheap.
  const allIconsQuery = useQuery({
    queryKey: ['canvas', 'icons', 'catalog', '__all__'],
    queryFn: loadAllIcons,
    enabled: hasIconsFeature && deferredQuery.trim().length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const allIcons = allIconsQuery.data;

  const searchResults = useMemo(
    () =>
      searchAssetCatalog(
        deferredQuery,
        {
          hasAssetsFeature,
          hasShapesFeature,
          hasChartsFeature,
          hasIconsFeature,
          hasFramesFeature,
        },
        userLocale,
        allIcons ?? getIconsSync() ?? []
      ),
    [
      deferredQuery,
      userLocale,
      hasAssetsFeature,
      hasShapesFeature,
      hasChartsFeature,
      hasIconsFeature,
      hasFramesFeature,
      allIcons,
    ]
  );

  const hasQuery = searchQuery.trim().length > 0;
  const hasDeferredQuery = deferredQuery.trim().length > 0;
  const isTyping = searchQuery !== debouncedQuery;
  const isSearching = hasQuery && (isTyping || !hasDeferredQuery);
  const showResults = hasDeferredQuery && searchResults.length > 0 && !isTyping;
  const showNoResults = hasDeferredQuery && searchResults.length === 0 && !isTyping;

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    hasQuery,
    isTyping,
    isSearching,
    showResults,
    showNoResults,
    deferredQuery,
  };
}
