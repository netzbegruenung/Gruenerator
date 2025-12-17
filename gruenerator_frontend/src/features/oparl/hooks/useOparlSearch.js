import { useState, useCallback } from 'react';
import { searchPapers, getIndexedCities } from '../services/oparlService';

export const useOparlSearch = () => {
  const [results, setResults] = useState([]);
  const [indexedCities, setIndexedCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [error, setError] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  const [lastQuery, setLastQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState(null);

  const handleSearch = useCallback(async (query, options = {}) => {
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
        limit: options.limit || 10
      });

      setResults(result.results || []);
      setTotalResults(result.total || 0);
    } catch (err) {
      console.error('[useOparlSearch] Search error:', err);
      setError(err.response?.data?.error || 'Fehler bei der Suche');
      setResults([]);
      setTotalResults(0);
    } finally {
      setIsSearching(false);
    }
  }, [selectedCity]);

  const loadIndexedCities = useCallback(async () => {
    setIsLoadingCities(true);
    try {
      const result = await getIndexedCities();
      setIndexedCities(result.cities || []);
    } catch (err) {
      console.error('[useOparlSearch] Cities error:', err);
    } finally {
      setIsLoadingCities(false);
    }
  }, []);

  const handleSelectCity = useCallback((city) => {
    setSelectedCity(city);
    if (lastQuery) {
      handleSearch(lastQuery, { city });
    }
  }, [lastQuery, handleSearch]);

  const clearCityFilter = useCallback(() => {
    setSelectedCity(null);
    if (lastQuery) {
      handleSearch(lastQuery, { city: null });
    }
  }, [lastQuery, handleSearch]);

  const handleSelectPaper = useCallback((paper) => {
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
    reset
  };
};

export default useOparlSearch;
