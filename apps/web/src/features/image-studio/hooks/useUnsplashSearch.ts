/**
 * useUnsplashSearch Hook
 *
 * Manages Unsplash search state, pagination, and loading states.
 * Handles search execution, load more functionality, and error management.
 */

import { useState, useCallback } from 'react';

import { searchUnsplashImages, type StockImage } from '../services/imageSourceService';

interface UseUnsplashSearchReturn {
  // State
  searchResults: StockImage[];
  totalResults: number;
  currentPage: number;
  isLoadingSearch: boolean;
  searchError: string | null;
  lastQuery: string;

  // Actions
  searchUnsplash: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;
  clearSearch: () => void;
}

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  const [searchResults, setSearchResults] = useState<StockImage[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  /**
   * Execute Unsplash search
   * Resets pagination and loads first page of results
   */
  const searchUnsplash = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setTotalResults(0);
      setCurrentPage(1);
      setLastQuery('');
      setSearchError(null);
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
      console.error('[useUnsplashSearch] Search failed:', error);
    } finally {
      setIsLoadingSearch(false);
    }
  }, []);

  /**
   * Load next page of results
   * Appends results to existing list
   */
  const loadMoreResults = useCallback(async () => {
    if (!lastQuery || isLoadingSearch) {
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
      console.error('[useUnsplashSearch] Load more failed:', error);
    } finally {
      setIsLoadingSearch(false);
    }
  }, [lastQuery, currentPage, isLoadingSearch]);

  /**
   * Clear all search state
   */
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
