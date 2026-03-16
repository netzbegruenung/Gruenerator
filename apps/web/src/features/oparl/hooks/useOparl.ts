import { useState, useCallback } from 'react';

import { searchCity, getPapers } from '../services/oparlService';

interface CityResult {
  city: string;
  [key: string]: unknown;
}

interface Paper {
  [key: string]: unknown;
}

interface Faction {
  [key: string]: unknown;
}

interface BodyInfo {
  [key: string]: unknown;
}

export const useOparl = () => {
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedCity, setSelectedCity] = useState<CityResult | null>(null);
  const [greenFactions, setGreenFactions] = useState<Faction[]>([]);
  const [bodyInfo, setBodyInfo] = useState<BodyInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalAvailable, setTotalAvailable] = useState(0);

  const handleSearchCity = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setCityResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const result = await searchCity(query);
      setCityResults(result.results || []);
    } catch (err: unknown) {
      console.error('[useOparl] City search error:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || 'Fehler bei der Stadtsuche');
      setCityResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectCity = useCallback(async (city: CityResult) => {
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
    } catch (err: unknown) {
      console.error('[useOparl] Papers fetch error:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || 'Fehler beim Laden der Anträge');
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
    reset,
  };
};

export default useOparl;
