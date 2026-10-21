import { useState, useCallback, useEffect } from 'react';

import { UnsplashLimitError } from '../image-source-service.js';

import type { StockImage, UnsplashSearchResult } from '../image-source-types.js';

export type UnsplashSearchFn = (
  query: string,
  page: number,
  perPage: number
) => Promise<UnsplashSearchResult>;

export interface UseUnsplashSearchReturn {
  searchResults: StockImage[];
  totalResults: number;
  currentPage: number;
  isLoadingSearch: boolean;
  searchError: string | null;
  /** Set when the shared hourly Unsplash quota is used up. */
  limit: { retryAt: Date } | null;
  /** Searches left this hour, as last reported by Unsplash. */
  remaining: number | null;
  lastQuery: string;
  searchUnsplash: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;
  clearSearch: () => void;
}

export function useUnsplashSearch(searchFn: UnsplashSearchFn): UseUnsplashSearchReturn {
  const [searchResults, setSearchResults] = useState<StockImage[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [limit, setLimit] = useState<{ retryAt: Date } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // The block lifts by itself once the quota window is over.
  useEffect(() => {
    if (!limit) return;
    const id = setTimeout(() => setLimit(null), Math.max(0, limit.retryAt.getTime() - Date.now()));
    return () => clearTimeout(id);
  }, [limit]);

  const applyResult = useCallback((result: UnsplashSearchResult) => {
    setLimit(null);
    if (result.rateLimitRemaining !== undefined) setRemaining(result.rateLimitRemaining);
  }, []);

  const applyError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof UnsplashLimitError) {
      setLimit({ retryAt: error.retryAt });
      setRemaining(0);
      return;
    }
    setSearchError(error instanceof Error ? error.message : fallback);
  }, []);

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

      setIsLoadingSearch(true);
      setSearchError(null);
      setLastQuery(query);
      setCurrentPage(1);

      try {
        const result = await searchFn(query, 1, 20);
        applyResult(result);
        setSearchResults(result.results);
        setTotalResults(result.total);
        setCurrentPage(1);
      } catch (error) {
        applyError(error, 'Fehler beim Suchen');
        setSearchResults([]);
        setTotalResults(0);
      } finally {
        setIsLoadingSearch(false);
      }
    },
    [searchFn, applyResult, applyError]
  );

  const loadMoreResults = useCallback(async () => {
    if (!lastQuery || isLoadingSearch) {
      return;
    }

    setIsLoadingSearch(true);
    setSearchError(null);
    const nextPage = currentPage + 1;

    try {
      const result = await searchFn(lastQuery, nextPage, 20);
      applyResult(result);
      setSearchResults((prev) => [...prev, ...result.results]);
      setCurrentPage(nextPage);
    } catch (error) {
      applyError(error, 'Fehler beim Laden');
    } finally {
      setIsLoadingSearch(false);
    }
  }, [lastQuery, currentPage, isLoadingSearch, searchFn, applyResult, applyError]);

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
    limit,
    remaining,
    lastQuery,
    searchUnsplash,
    loadMoreResults,
    clearSearch,
  };
}
