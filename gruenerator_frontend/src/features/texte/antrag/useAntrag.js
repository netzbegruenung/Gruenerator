import { useCallback, useState } from 'react';
import { useAntragContext } from './AntragContext';
import { useAntragService } from './AntragService';
import { saveAntrag } from './antragSaveUtils';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { createStructuredFinalPrompt } from '../../../utils/promptUtils';

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
  
  // Store integration for knowledge
  const {
    source,
    availableKnowledge,
    selectedKnowledgeIds
  } = useGeneratorKnowledgeStore();

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  const formatAntragContent = useCallback((content) => {
    if (!content) return '';
    
    if (content.startsWith('Betreff:')) {
      return content;
    }
    
    return content;
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

  const generateAntrag = useCallback(async (finalPrompt = null, currentFormData = null) => {
    // Generate knowledge content from store if available
    let enhancedPrompt = finalPrompt;
    
    if (!enhancedPrompt && (source.type === 'user' || source.type === 'group')) {
      const hasSelectedKnowledge = selectedKnowledgeIds.length > 0;
      const hasLoadedKnowledge = availableKnowledge.length > 0;
      
      if (hasLoadedKnowledge) {
        let knowledgeContent = null;
        
        if (hasSelectedKnowledge) {
          // Use only selected knowledge items
          const selectedItems = availableKnowledge.filter(item => 
            selectedKnowledgeIds.includes(item.id)
          );
          knowledgeContent = selectedItems.map(item => {
            return `## ${item.title}\n${item.content}`;
          }).join('\n\n');
          console.log(`[useAntrag] Using ${selectedItems.length} selected knowledge items from source: ${source.type}`);
        } else {
          // Use all available knowledge from the selected source
          knowledgeContent = availableKnowledge.map(item => {
            return `## ${item.title}\n${item.content}`;
          }).join('\n\n');
          console.log(`[useAntrag] Using all ${availableKnowledge.length} knowledge items from source: ${source.type}`);
        }
        
        if (knowledgeContent) {
          enhancedPrompt = createStructuredFinalPrompt(null, knowledgeContent);
          console.log('[useAntrag] Enhanced prompt with knowledge content created.');
        }
      }
    }

    if (useWebSearch) {
      setLoading(true);
      setError(null);
      
      try {
        // Use current form data if provided, otherwise fall back to context formData
        const baseFormData = currentFormData || formData;
        const extendedFormData = { ...baseFormData };
        
        if (enhancedPrompt) {
          extendedFormData.customPrompt = enhancedPrompt;
        }
        
        const { AntragService } = await import('./AntragService');
        const response = await AntragService.generateAntragWithWebSearch(extendedFormData, simpleAntragSubmit.submitForm);
        
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
        // Use current form data if provided, otherwise fall back to context formData
        const baseFormData = currentFormData || formData;
        const extendedFormData = { ...baseFormData };
        
        if (enhancedPrompt) {
          extendedFormData.customPrompt = enhancedPrompt;
        }
        
        const { AntragService } = await import('./AntragService');
        const response = await AntragService.generateAntragClassic(extendedFormData, simpleAntragSubmit.submitForm);
        
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
  }, [
    formData, 
    useWebSearch, 
    formatAntragContent, 
    setGeneratedAntrag, 
    formatAndDisplaySources, 
    setLoading, 
    setError, 
    simpleAntragSubmit.submitForm,
    source,
    availableKnowledge,
    selectedKnowledgeIds
  ]);

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