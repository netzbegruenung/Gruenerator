import { useState, useCallback } from 'react';
import { searchCity, getPapers, getEndpoints } from '../services/oparlService';

export const useOparl = () => {
  const [cityResults, setCityResults] = useState([]);
  const [papers, setPapers] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [greenFactions, setGreenFactions] = useState([]);
  const [bodyInfo, setBodyInfo] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);
  const [error, setError] = useState(null);
  const [totalAvailable, setTotalAvailable] = useState(0);

  const handleSearchCity = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setCityResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const result = await searchCity(query);
      setCityResults(result.results || []);
    } catch (err) {
      console.error('[useOparl] City search error:', err);
      setError(err.response?.data?.error || 'Fehler bei der Stadtsuche');
      setCityResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectCity = useCallback(async (city) => {
    setSelectedCity(city);
    setIsLoadingPapers(true);
    setError(null);
    setPapers([]);
    setGreenFactions([]);
    setBodyInfo(null);

    try {
      const result = await getPapers(city.city);
      setPapers(result.papers || []);
      setGreenFactions(result.greenFactions || []);
      setBodyInfo(result.body || null);
      setTotalAvailable(result.totalAvailable || 0);
    } catch (err) {
      console.error('[useOparl] Papers fetch error:', err);
      setError(err.response?.data?.error || 'Fehler beim Laden der Anträge');
    } finally {
      setIsLoadingPapers(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCityResults([]);
    setPapers([]);
    setSelectedCity(null);
    setGreenFactions([]);
    setBodyInfo(null);
    setError(null);
    setTotalAvailable(0);
  }, []);

  return {
    cityResults,
    papers,
    selectedCity,
    greenFactions,
    bodyInfo,
    isSearching,
    isLoadingPapers,
    error,
    totalAvailable,
    searchCity: handleSearchCity,
    selectCity: handleSelectCity,
    reset
  };
};

export default useOparl;
