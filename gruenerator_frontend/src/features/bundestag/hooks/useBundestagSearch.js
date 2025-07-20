import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

const useBundestagSearch = () => {
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  
  const { submitForm, loading, error: apiError } = useApiSubmit('bundestag/search');
  const [error, setError] = useState(null);

  const clearResults = () => {
    setResults([]);
    setError(null);
    setTotalResults(0);
  };

  const search = useCallback(async (query, options = {}) => {
    if (!query || query.trim().length < 3) {
      setError('Suchbegriff muss mindestens 3 Zeichen lang sein');
      return;
    }

    clearResults();

    try {
      const {
        includeDrucksachen = true,
        includePlenarprotokolle = true,
        includeVorgaenge = false,
        maxDrucksachen = 5,
        maxPlenarprotokolle = 3,
        maxVorgaenge = 2
      } = options;

      const data = await submitForm({
        query: query.trim(),
        includeDrucksachen,
        includePlenarprotokolle,
        includeVorgaenge,
        maxDrucksachen,
        maxPlenarprotokolle,
        maxVorgaenge
      });

      console.log('[useBundestagSearch] Received data from submitForm:', data);
      console.log('[useBundestagSearch] Data structure check:', {
        hasData: !!data,
        hasSuccess: !!data?.success,
        hasResults: data?.results !== undefined,
        resultsType: typeof data?.results,
        isResultsArray: Array.isArray(data?.results),
        resultsLength: data?.results?.length
      });

      if (data && data.success && Array.isArray(data.results)) {
        console.log('[useBundestagSearch] Processing', data.results.length, 'search results');
        
        // Transform results for gallery display
        const transformedResults = data.results.map(doc => {
          const transformed = {
            id: doc.id,
            title: doc.title || doc.bezeichnung || 'Unbenanntes Dokument',
            type: doc.type,
            date: doc.datum || doc.aktualisiert,
            fundstelle: doc.fundstelle,
            abstract: doc.abstract || (doc.text ? doc.text.substring(0, 200) + '...' : undefined),
            text: doc.text, // Preserve full text content for saving
            dokumentart: doc.dokumentart,
            drucksachetyp: doc.drucksachetyp,
            initiative: doc.initiative,
            wahlperiode: doc.wahlperiode,
            nummer: doc.nummer,
            url: doc.url,
            vorgangsposition: doc.vorgangsposition
          };
          
          // Debug: Log text content for each document type
          console.log(`[useBundestagSearch] Document ${doc.id} (${doc.type}):`, {
            hasText: !!doc.text,
            textLength: doc.text ? doc.text.length : 0,
            textPreview: doc.text ? doc.text.substring(0, 50) + '...' : 'NO TEXT',
            transformedHasText: !!transformed.text
          });
          
          return transformed;
        });

        setResults(transformedResults);
        setTotalResults(data.totalResults || transformedResults.length);
        console.log('[useBundestagSearch] Successfully set', transformedResults.length, 'results');
      } else {
        console.error('[useBundestagSearch] Invalid response structure:', data);
        const errorDetails = {
          hasData: !!data,
          dataType: typeof data,
          hasSuccess: data?.success,
          hasResults: data?.results !== undefined,
          resultsType: typeof data?.results,
          isArray: Array.isArray(data?.results)
        };
        console.error('[useBundestagSearch] Error details:', errorDetails);
        
        if (!data) {
          throw new Error('Keine Antwort vom Server erhalten');
        } else if (!data.success) {
          throw new Error(data.error || 'Server meldete einen Fehler');
        } else if (!Array.isArray(data.results)) {
          throw new Error(`Ungültiges Antwortformat: results ist ${typeof data.results}, erwartet wurde Array`);
        } else {
          throw new Error('Unbekannter Fehler bei der Suche');
        }
      }
    } catch (err) {
      console.error('Bundestag search error:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten');
      setResults([]);
    }
  }, [submitForm]);

  const getDocument = useCallback(async (id, type) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      
      const response = await fetch(`${API_BASE_URL}/api/bundestag/document/${type}/${id}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Dokument konnte nicht geladen werden';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.success && data.document) {
        return data.document;
      } else {
        throw new Error('Ungültiges Antwortformat vom Server');
      }
    } catch (err) {
      console.error('Document fetch error:', err);
      throw new Error(`Fehler beim Laden des Dokuments: ${err.message}`);
    }
  }, []);

  return {
    results,
    loading,
    error: error || apiError,
    totalResults,
    search,
    getDocument,
    clearResults
  };
};

export default useBundestagSearch;