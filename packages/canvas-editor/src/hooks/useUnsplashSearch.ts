import { useState, useCallback } from 'react';

import { useCanvasEditorServices } from '../CanvasEditorProvider';

import type { StockImage } from '../common/imageSourceTypes';

interface UseUnsplashSearchReturn {
  searchResults: StockImage[];
  totalResults: number;
  currentPage: number;
  isLoadingSearch: boolean;
  searchError: string | null;
  lastQuery: string;
  searchUnsplash: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;
  clearSearch: () => void;
}

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  const { searchUnsplashImages } = useCanvasEditorServices();
  const [searchResults, setSearchResults] = useState<StockImage[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const searchUnsplash = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setTotalResults(0);
        setCurrentPage(1);
        setLastQuery('');
        setSearchError(null);
        return;
      }

      if (!searchUnsplashImages) {
        setSearchError('Unsplash-Suche ist nicht verfügbar');
        return;
      }

      setIsLoadingSearch(true);
      setSearchError(null);
      setLastQuery(query);
      setCurrentPage(1);

      try {
        const result = await searchUnsplashImages(query, 1, 20);
        setSearchResults(result.results);
        setTotalResults(result.total);
        setCurrentPage(1);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Fehler beim Suchen';
        setSearchError(errorMessage);
        setSearchResults([]);
        setTotalResults(0);
      } finally {
        setIsLoadingSearch(false);
      }
    },
    [searchUnsplashImages]
  );

  const loadMoreResults = useCallback(async () => {
    if (!lastQuery || isLoadingSearch || !searchUnsplashImages) {
      return;
    }

    setIsLoadingSearch(true);
    setSearchError(null);
    const nextPage = currentPage + 1;

    try {
      const result = await searchUnsplashImages(lastQuery, nextPage, 20);
      setSearchResults((prev) => [...prev, ...result.results]);
      setCurrentPage(nextPage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Laden';
      setSearchError(errorMessage);
    } finally {
      setIsLoadingSearch(false);
    }
  }, [lastQuery, currentPage, isLoadingSearch, searchUnsplashImages]);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setTotalResults(0);
    setCurrentPage(1);
    setSearchError(null);
    setLastQuery('');
  }, []);

  return {
    searchResults,
    totalResults,
    currentPage,
    isLoadingSearch,
    searchError,
    lastQuery,
    searchUnsplash,
    loadMoreResults,
    clearSearch,
  };
}
