import { useState, useCallback } from 'react';

import { searchPapers, getIndexedCities } from '../services/oparlService';

import type { OparlPaper, SearchResult, IndexedCitiesResult } from '../types';

export const useOparlSearch = () => {
  const [results, setResults] = useState<OparlPaper[]>([]);
  const [indexedCities, setIndexedCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [lastQuery, setLastQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState<OparlPaper | null>(null);

  const handleSearch = useCallback(
    async (query: string, options: { city?: string | null; limit?: number } = {}) => {
      if (!query || query.trim().length < 2) {
        setError('Suchanfrage muss mindestens 2 Zeichen haben');
        return;
      }

      setIsSearching(true);
      setError(null);
      setLastQuery(query.trim());

      try {
        const result = await searchPapers(query.trim(), {
          city: options.city || selectedCity,
          limit: options.limit || 10,
        });

        setResults((result as SearchResult).results || []);
        setTotalResults((result as SearchResult).total || 0);
      } catch (err: unknown) {
        console.error('[useOparlSearch] Search error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Fehler bei der Suche';
        setError(errorMessage);
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedCity]
  );

  const loadIndexedCities = useCallback(async () => {
    setIsLoadingCities(true);
    try {
      const result = await getIndexedCities();
      setIndexedCities((result as IndexedCitiesResult).cities || []);
    } catch (err: unknown) {
      console.error('[useOparlSearch] Cities error:', err);
    } finally {
      setIsLoadingCities(false);
    }
  }, []);

  const handleSelectCity = useCallback(
    (city: string) => {
      setSelectedCity(city);
      if (lastQuery) {
        handleSearch(lastQuery, { city });
      }
    },
    [lastQuery, handleSearch]
  );

  const clearCityFilter = useCallback(() => {
    setSelectedCity(null);
    if (lastQuery) {
      handleSearch(lastQuery, { city: null });
    }
  }, [lastQuery, handleSearch]);

  const handleSelectPaper = useCallback((paper: OparlPaper) => {
    setSelectedPaper(paper);
  }, []);

  const clearSelectedPaper = useCallback(() => {
    setSelectedPaper(null);
  }, []);

  const reset = useCallback(() => {
    setResults([]);
    setSelectedCity(null);
    setError(null);
    setTotalResults(0);
    setLastQuery('');
    setSelectedPaper(null);
  }, []);

  return {
    results,
    indexedCities,
    selectedCity,
    isSearching,
    isLoadingCities,
    error,
    totalResults,
    lastQuery,
    selectedPaper,
    search: handleSearch,
    loadIndexedCities,
    selectCity: handleSelectCity,
    clearCityFilter,
    selectPaper: handleSelectPaper,
    clearSelectedPaper,
    reset,
  };
};

export default useOparlSearch;
