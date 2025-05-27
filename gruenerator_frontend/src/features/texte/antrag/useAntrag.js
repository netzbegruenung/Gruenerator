import { useCallback, useState } from 'react';
import { useAntragContext } from './AntragContext';
import { useAntragService } from './AntragService';
import { saveAntrag } from './antragSaveUtils';

const SEARCH_STATES = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  DONE: 'done',
  ERROR: 'error'
};

export const useAntrag = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const {
    formData,
    setFormData,
    useWebSearch,
    generatedAntrag,
    setGeneratedAntrag,
    setDisplayedSources,
    setLoading,
    setError,
    loading,
  } = useAntragContext();

  const { simpleAntragSubmit } = useAntragService();

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  const formatAntragContent = useCallback((content) => {
    if (!content) return '';
    
    if (content.startsWith('PRESSEMITTEILUNG:') || 
        content.startsWith('Betreff:') || 
        content.startsWith('ANTRAG:')) {
      return content;
    }
    
    const formattedAntrag = `ANTRAG: \n\n${content}`;
    return formattedAntrag;
  }, []);

  const formatAndDisplaySources = useCallback((results) => {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return;
    }
    
    const sources = results.map((result, index) => {
      const title = result.title || 'Quelle';
      const url = result.link || result.url || '';
      return `[${index + 1}] ${title}\n${url}\n`;
    }).join('\n');
    
    setDisplayedSources(sources);
  }, [setDisplayedSources]);

  const generateAntrag = useCallback(async (finalPrompt = null) => {
    if (useWebSearch) {
      setLoading(true);
      setError(null);
      
      try {
        const extendedFormData = { ...formData };
        
        if (finalPrompt) {
          extendedFormData.customPrompt = finalPrompt;
        }
        
        const { AntragService } = await import('./AntragService');
        const response = await AntragService.generateAntragWithWebSearch(extendedFormData);
        
        if (!response || !response.content) {
          throw new Error('Keine Antwort vom Web Search Service erhalten');
        }
        
        const formattedAntrag = formatAntragContent(response.content);
        setGeneratedAntrag(formattedAntrag);
        
        if (response.metadata?.sources) {
          formatAndDisplaySources(response.metadata.sources);
        }
        
        return response.content;
        
      } catch (error) {
        console.error('[useAntrag] Fehler bei Web Search Tool Use:', error);
        setError(error.message || 'Fehler bei der Websuche');
        throw error;
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      setError(null);
      
      try {
        const extendedFormData = { ...formData };
        
        if (finalPrompt) {
          extendedFormData.customPrompt = finalPrompt;
        }
        
        const { AntragService } = await import('./AntragService');
        const response = await AntragService.generateAntragClassic(extendedFormData);
        
        if (!response || !response.content) {
          throw new Error('Keine Antwort erhalten');
        }
        
        const formattedAntrag = formatAntragContent(response.content);
        setGeneratedAntrag(formattedAntrag);
        
        return response.content;
        
      } catch (error) {
        console.error('[useAntrag] Fehler bei klassischer Generierung:', error);
        setError(error.message || 'Fehler bei der Generierung');
        throw error;
      } finally {
        setLoading(false);
      }
    }
  }, [formData, useWebSearch, formatAntragContent, setGeneratedAntrag, formatAndDisplaySources, setLoading, setError]);

  const saveGeneratedAntrag = useCallback(async (antragData) => {
    if (!antragData || !antragData.title || !antragData.antragstext) {
      throw new Error('Unvollständige Antragsdaten');
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await saveAntrag(antragData);
      console.log('[useAntrag] Antrag erfolgreich gespeichert:', response);
      setSaveStatus({ type: 'success', message: 'Antrag erfolgreich gespeichert!' });
      return response;
    } catch (error) {
      console.error('[useAntrag] Fehler beim Speichern:', error);
      setSaveStatus({ type: 'error', message: error.message || 'Fehler beim Speichern' });
      throw error;
    } finally {
        setIsSaving(false);
    }
  }, []);

  const resetSaveStatus = useCallback(() => {
    setSaveStatus(null);
  }, []);

  return {
    formData,
    handleInputChange,
    generateAntrag,
    generatedAntrag,
    loading,
    saveGeneratedAntrag,
    isSaving,
    saveStatus,
    resetSaveStatus,
    useWebSearch
  };
}; 