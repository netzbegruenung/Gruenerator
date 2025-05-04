import { useCallback, useState } from 'react';
import { useAntragContext } from './AntragContext';
import { useAntragService } from './AntragService';
import { useAntragSearch, SEARCH_STATES } from './hooks/useAntragSearch';
import apiClient from '../../../components/utils/apiClient'; // Import the configured axios client
import { saveAntrag } from './antragSaveUtils';

// Hilfsfunktion zur Normalisierung von Suchergebnissen
const normalizeSearchResults = (results) => {
  if (Array.isArray(results)) return results;
  if (results && Array.isArray(results.results)) return results.results;
  return [];
};

export const useAntrag = () => {
  const [searchState, setSearchState] = useState(SEARCH_STATES.IDLE);
  const [searchQuery, setSearchQuery] = useState('');
  // Neue States für den Speicherprozess
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // { type: 'success' | 'error', message: string }

  const {
    formData,
    setFormData,
    useWebSearch,
    generatedAntrag, // Füge generatedAntrag aus dem Context hinzu
    setGeneratedAntrag,
    setDisplayedSearchResults,
    setDisplayedSources,
    setLoading,
    setError,
    loading,
  } = useAntragContext();

  const { antragSubmit, simpleAntragSubmit } = useAntragService();
  const { 
    generateSearchQuery, 
    performSearch,
    searchResults: searchQueryResults, 
    error: searchError
  } = useAntragSearch();

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  // Formatieren und Anzeigen der Suchanfrage
  const formatAndDisplaySearchQuery = useCallback((query) => {
    if (!query) return;
    
    setSearchQuery(query);
    // Suchanfrage nicht mehr anzeigen, nur im Hintergrund verarbeiten
    console.log('[useAntrag] Formatierte Suchanfrage:', query);
    
    // Zurücksetzen der anderen Anzeigen
    setGeneratedAntrag('');
    setDisplayedSources('');
  }, [setDisplayedSearchResults, setGeneratedAntrag, setDisplayedSources]);

  // Hilfsfunktion zum Formatieren des Antrags
  const formatAntragContent = useCallback((content) => {
    if (!content) return '';
    
    // Prüfe, ob der Inhalt bereits mit einem Header beginnt
    if (content.startsWith('PRESSEMITTEILUNG:') || 
        content.startsWith('Betreff:') || 
        content.startsWith('ANTRAG:')) {
      console.log('[useAntrag] Antrag hat bereits einen Header:', content.substring(0, 50) + '...');
      return content;
    }
    
    // Füge ANTRAG: Header hinzu - mit deutlichem Abstand
    const formattedAntrag = `ANTRAG: \n\n${content}`;
    console.log('[useAntrag] Formatierter Antrag:', formattedAntrag.substring(0, 50) + '...');
    return formattedAntrag;
  }, []);

  // Formatieren und Anzeigen der Suchergebnisse als Quellen
  const formatAndDisplaySources = useCallback((results) => {
    // Prüfe, ob results ein gültiges Objekt ist
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn('[useAntrag] Keine Quellen zum Anzeigen vorhanden');
      return;
    }
    
    // Formatiere die Ergebnisse als Quellenangaben
    const sources = results.map((result, index) => {
      // Extrahiere Titel und URL
      const title = result.title || 'Quelle';
      const url = result.link || result.url || '';
      
      return `[${index + 1}] ${title}\n${url}\n`;
    }).join('\n');
    
    console.log('[useAntrag] Formatierte Quellen:', sources.substring(0, 100) + '...');
    setDisplayedSources(sources);
  }, [setDisplayedSources]);

  // Formatieren und Anzeigen der Suchergebnisse
  const formatAndDisplaySearchResults = useCallback((results) => {
    // Prüfe, ob results ein gültiges Objekt ist
    if (!results || !results.results || !Array.isArray(results.results) || results.results.length === 0) {
      console.warn('[useAntrag] Keine Suchergebnisse zum Anzeigen vorhanden:', results);
      return;
    }
    
    // Suchergebnisse nicht mehr anzeigen
    console.log('[useAntrag] Suchergebnisse erhalten:', results.results.length);
  }, [setDisplayedSources]);

  // Generiere den Antrag mit den Suchergebnissen
  const generateAntragWithSearchResults = useCallback(async (searchResults, useEuropaMode = false) => {
    const normalizedResults = normalizeSearchResults(searchResults);
    
    if (normalizedResults.length === 0) {
      console.error('[useAntrag] Ungültige Suchergebnisse:', searchResults);
      throw new Error('Keine Suchergebnisse vorhanden');
    }
    
    setLoading(true);
    setError(null);
    setSearchState(SEARCH_STATES.GENERATING_ANTRAG);
    
    try {
      console.log('[useAntrag] Generiere Antrag mit Suchergebnissen:', normalizedResults, 'Europa Mode:', useEuropaMode);
      
      const antragResponse = await antragSubmit.submitForm({
        idee: formData.idee,
        details: formData.details,
        gliederung: formData.gliederung,
        searchResults: normalizedResults,
        useWebSearch: true
      }, false, useEuropaMode);
      
      console.log('[useAntrag] Antwort vom Backend mit Websuche:', antragResponse);
      
      let antragContent;
      if (typeof antragResponse === 'string') {
        antragContent = antragResponse;
      } else if (antragResponse?.content) {
        antragContent = antragResponse.content;
      } else if (antragResponse?.metadata?.content) {
        antragContent = antragResponse.metadata.content;
      } else {
        throw new Error('Kein Antrag generiert');
      }
      
      // Lösche vorherige Anzeigen vor dem Setzen des neuen Antrags
      setDisplayedSearchResults('');
      
      // Formatiere und setze den Antrag
      const formattedAntrag = formatAntragContent(antragContent);
      setGeneratedAntrag(formattedAntrag);
      
      // Quellen anzeigen
      formatAndDisplaySources(normalizedResults);
      
      setSearchState(SEARCH_STATES.DONE);
      return antragContent;
    } catch (error) {
      console.error('[useAntrag] Fehler bei der Antragsgenerierung mit Suchergebnissen:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten');
      setSearchState(SEARCH_STATES.ERROR);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    formData, 
    antragSubmit, 
    formatAntragContent, 
    formatAndDisplaySources, 
    setGeneratedAntrag, 
    setLoading, 
    setError, 
    setDisplayedSearchResults, 
    setDisplayedSources
  ]);

  // Durchführen der Suche
  const executeSearch = useCallback(async (query, useEuropaMode = false) => {
    if (!query) {
      throw new Error('Keine Suchanfrage vorhanden');
    }
    
    setLoading(true);
    setError(null);
    setSearchState(SEARCH_STATES.SEARCHING);
    
    try {
      console.log('[useAntrag] Starte Suche für:', query, 'Europa Mode:', useEuropaMode);
      const results = await performSearch(query, useEuropaMode);
      
      // Suchergebnisse prüfen und dann direkt Antrag generieren
      if (results && results.results && Array.isArray(results.results)) {
        console.log('[useAntrag] Suchergebnisse erhalten:', results.results.length);
        
        // Automatisch mit den Suchergebnissen den Antrag generieren
        try {
          console.log('[useAntrag] Starte automatisch Antragsgenerierung mit Suchergebnissen');
          await generateAntragWithSearchResults(results.results, useEuropaMode);
        } catch (antragError) {
          console.error('[useAntrag] Fehler bei automatischer Antragsgenerierung:', antragError);
          setError(antragError.message || 'Fehler bei der automatischen Antragsgenerierung');
        }
      } else {
        console.warn('[useAntrag] Keine Ergebnisse in der Antwort gefunden:', results);
        setError('Keine Suchergebnisse gefunden');
      }
      
      setSearchState(SEARCH_STATES.DONE);
      return results;
    } catch (error) {
      console.error('[useAntrag] Fehler bei der Suche:', error);
      setError(error.message || 'Fehler bei der Suche');
      setSearchState(SEARCH_STATES.ERROR);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    performSearch, 
    setLoading, 
    setError, 
    generateAntragWithSearchResults
  ]);

  // Generiere nur die Suchanfrage und starte dann die Suche
  const generateSearchQueryOnly = useCallback(async (useEuropaMode = false) => {
    setLoading(true);
    setError(null);
    setSearchState(SEARCH_STATES.GENERATING_QUERY);
    
    try {
      console.log('[useAntrag] Generiere Suchanfrage mit Formdata:', formData, 'Europa Mode:', useEuropaMode);
      const searchResponse = await generateSearchQuery(formData, useEuropaMode);
      
      if (!searchResponse) {
        throw new Error('Keine Antwort bei Suchanfragengeneration erhalten');
      }
      
      // Extrahiere die Suchanfrage aus der Antwort
      const query = searchResponse.content || searchResponse;
      
      if (!query) {
        throw new Error('Keine Suchanfrage wurde generiert');
      }
      
      console.log('[useAntrag] Generierte Suchanfrage:', query);
      
      // Suchanfrage im Hintergrund verarbeiten
      formatAndDisplaySearchQuery(query);
      
      // Zurücksetzen der vorherigen Suchergebnisse
      setDisplayedSources('');
      
      // Starte automatisch die Suche mit der generierten Anfrage
      try {
        console.log('[useAntrag] Starte automatische Suche mit Anfrage:', query);
        await executeSearch(query, useEuropaMode);
      } catch (searchError) {
        console.error('[useAntrag] Fehler bei automatischer Suche:', searchError);
        setError(searchError.message || 'Fehler bei der automatischen Suche');
      }
      
      setSearchState(SEARCH_STATES.DONE);
      return query;
    } catch (error) {
      console.error('[useAntrag] Fehler bei Generierung der Suchanfrage:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten');
      setSearchState(SEARCH_STATES.ERROR);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    formData, 
    generateSearchQuery, 
    formatAndDisplaySearchQuery, 
    executeSearch,
    setLoading, 
    setError, 
    setDisplayedSources
  ]);

  // Hauptfunktion für die Antragsgenerierung
  const generateAntrag = useCallback(async (useEuropaMode = false, customPrompt = null) => {
    if (useWebSearch) {
      // Suchanfrage generieren und automatisch weiterverarbeiten
      console.log('[useAntrag] Starte automatisierten Prozess (Suchanfrage → Suche → Antrag), Europa Mode:', useEuropaMode);
      return generateSearchQueryOnly(useEuropaMode);
    } else {
      // Ohne Websuche - direkte Implementierung wie bei Antragsgenerator.js
      setLoading(true);
      setError(null);
      
      try {
        console.log('[useAntrag] Starte vereinfachte Antragsgenerierung ohne Websuche, Europa Mode:', useEuropaMode);
        
        // Prüfe, ob idee vorhanden ist
        if (!formData.idee && !customPrompt) {
          throw new Error('Bitte gib eine Idee ein');
        }
        
        // FormData erweitern mit benutzerdefinierten Anweisungen, falls vorhanden
        const extendedFormData = {
          ...formData
        };
        
        if (customPrompt) {
          extendedFormData.customPrompt = customPrompt;
          console.log('[useAntrag] Benutzerdefinierter Prompt hinzugefügt');
        }
        
        // Vereinfacht: Direkt formData senden ohne Filterung
        const content = await simpleAntragSubmit.submitForm(extendedFormData, false, useEuropaMode);
        
        if (content) {
          setGeneratedAntrag(content); 
          // FormContext wird über AntragForm.handleGeneratedContentChange aktualisiert
        }
        
        return content;
      } catch (error) {
        console.error('[useAntrag] Fehler:', error);
        setError(error.message || 'Ein Fehler ist aufgetreten');
        throw error;
      } finally {
        setLoading(false);
      }
    }
  }, [
    formData, 
    useWebSearch, 
    simpleAntragSubmit,
    generateSearchQueryOnly,
    setGeneratedAntrag,
    setLoading, 
    setError
  ]);

  const truncateErrorMessage = (msg) => {
    return msg.length > 40 ? msg.substring(0, 40) + '...' : msg;
  };

  const getStatusMessage = () => {
    switch (searchState) {
      case SEARCH_STATES.GENERATING_QUERY:
        return 'Generiere Suchanfrage...';
      case SEARCH_STATES.SEARCHING:
        return searchQuery?.length > 30 
          ? `Suche: ${searchQuery.substring(0, 30)}...`
          : `Suche: ${searchQuery}`;
      case SEARCH_STATES.GENERATING_ANTRAG:
        return 'Erstelle Antrag...';
      case SEARCH_STATES.ERROR:
        return truncateErrorMessage(searchError || antragSubmit.error || simpleAntragSubmit.error || 'Fehler');
      default:
        return '';
    }
  };

  // Funktion zum Speichern des Antrags in der Datenbank via Backend API
  const saveAntragToDb = useCallback(async (payload) => {
    setIsSaving(true);
    setSaveStatus(null);
    console.log('[useAntrag] Calling external saveAntrag function...');

    try {
        // Call the imported saveAntrag function
        const savedAntrag = await saveAntrag(payload);

        // If saveAntrag resolves, it was successful
        console.log('[useAntrag] External saveAntrag successful:', savedAntrag);
        setSaveStatus({ type: 'success', message: `Antrag "${savedAntrag.title || 'Unbenannt'}" erfolgreich gespeichert!` });
        setIsSaving(false);
        return savedAntrag; // Return the saved data

    } catch (error) {
        // If saveAntrag throws an error, catch it here
        console.error('[useAntrag] Error received from external saveAntrag:', error);
        // Use the error message provided by the saveAntrag function
        setSaveStatus({ type: 'error', message: error.message || 'Ein Fehler ist beim Speichern aufgetreten.' });
        setIsSaving(false);
        // Optionally re-throw or just handle via state
        // throw error; // Depends if the caller needs to catch it further
    }
    // No finally block needed here for setIsSaving(false) as it's handled in try/catch
  }, []); // Keep dependency array empty, as saveAntrag is imported and doesn't depend on hook state directly

  return {
    formData,
    handleInputChange,
    generateAntrag,
    executeSearch,
    generateAntragWithSearchResults,
    searchQuery,
    searchResults: searchQueryResults,
    searchState,
    statusMessage: getStatusMessage(),
    loading: loading || antragSubmit.loading || simpleAntragSubmit.loading,
    error: searchError || antragSubmit.error || simpleAntragSubmit.error,
    // Exportiere die neuen States und die Funktion
    isSaving,
    saveStatus,
    saveAntragToDb
  };
}; 