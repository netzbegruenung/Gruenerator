import { useState, useCallback } from 'react';
import useApiSubmit from '../../../../components/hooks/useApiSubmit';

export const SEARCH_STATES = {
  IDLE: 'IDLE',
  GENERATING_QUERY: 'GENERATING_QUERY',
  SEARCHING: 'SEARCHING',
  GENERATING_ANTRAG: 'GENERATING_ANTRAG',
  DONE: 'DONE',
  ERROR: 'ERROR'
};

export const useAntragSearch = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState(SEARCH_STATES.IDLE);

  const searchQuerySubmit = useApiSubmit('claude/search-query');
  const searchSubmit = useApiSubmit('search');

  const extractSearchQuery = (response) => {
    if (!response) {
      console.error('Keine Antwort erhalten');
      return null;
    }
    
    console.log('Verarbeite Suchanfrage:', response);
    
    // Wenn die Antwort direkt ein String ist
    if (typeof response === 'string') {
      return response.trim();
    }
    
    // Wenn die Antwort ein content Feld hat (neue API-Struktur)
    if (response.content) {
      return response.content.trim();
    }
    
    // Fallback für alte API-Struktur
    if (response.searchQuery) {
      return response.searchQuery.trim();
    }
    
    console.error('Keine gültige Suchanfrage in der Antwort gefunden:', response);
    return null;
  };

  // Nur die Suchanfrage generieren
  const generateSearchQuery = useCallback(async (formData) => {
    setError(null);
    setSearchState(SEARCH_STATES.GENERATING_QUERY);
    
    try {
      // Validiere Eingaben - nur idee ist erforderlich
      if (!formData.idee) {
        throw new Error('Bitte gib eine Idee ein');
      }

      // Claude generiert die Suchanfrage
      const searchQueryResponse = await searchQuerySubmit.submitForm({
        idee: formData.idee,
        details: formData.details || '',
        gliederung: formData.gliederung || ''
      });

      const cleanQuery = extractSearchQuery(searchQueryResponse);
      if (!cleanQuery) {
        throw new Error('Keine Suchanfrage generiert');
      }
      
      setSearchQuery(cleanQuery);
      setSearchState(SEARCH_STATES.DONE);
      
      return searchQueryResponse;
    } catch (err) {
      console.error('[useAntragSearch] Error bei Suchanfrage:', err);
      const errorMessage = err.response?.data?.error || 
                         err.response?.data?.message || 
                         err.message || 
                         'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      setSearchState(SEARCH_STATES.ERROR);
      throw err;
    }
  }, [searchQuerySubmit]);

  // Suche durchführen mit der generierten Anfrage
  const performSearch = useCallback(async (query) => {
    setError(null);
    setSearchState(SEARCH_STATES.SEARCHING);
    
    try {
      if (!query) {
        throw new Error('Keine Suchanfrage vorhanden');
      }
      
      console.log('[useAntragSearch] Starte Suche mit Anfrage:', query);
      
      // Tavily-Suche mit 5 Ergebnissen und Inhalten
      const searchResponse = await searchSubmit.submitForm({
        query: query.trim(),
        options: {
          search_depth: 'advanced',
          max_results: 5,
          include_raw_content: true
        }
      });

      console.log('[useAntragSearch] Suchantwort erhalten:', searchResponse);

      // Verarbeite die Ergebnisse
      const results = searchResponse?.results || [];

      if (!Array.isArray(results) || results.length === 0) {
        console.warn('[useAntragSearch] Keine Suchergebnisse gefunden');
        throw new Error('Keine Suchergebnisse gefunden');
      }

      // Normalisiere die Ergebnisse
      const normalizedResults = results.map(result => ({
        title: result.title || '',
        content: result.content || result.snippet || '',
        url: result.url || '',
        score: result.score || 0
      }));

      console.log('[useAntragSearch] Normalisierte Ergebnisse:', normalizedResults);
      setSearchResults(normalizedResults);
      setSearchState(SEARCH_STATES.DONE);
      
      return {
        query: query,
        results: normalizedResults
      };
    } catch (err) {
      console.error('[useAntragSearch] Fehler bei Suche:', err);
      const errorMessage = err.response?.data?.error || 
                         err.response?.data?.message || 
                         err.message || 
                         'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      setSearchState(SEARCH_STATES.ERROR);
      throw err;
    }
  }, [searchSubmit]);

  return {
    searchResults,
    searchQuery,
    error,
    generateSearchQuery,
    performSearch,
    loading: searchQuerySubmit.loading || searchSubmit.loading,
    searchState
  };
}; 