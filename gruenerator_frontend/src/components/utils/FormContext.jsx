import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { useNavigationWarning } from '../common/editor/hooks';
import { removeAllHighlights } from '../common/editor/utils/highlightUtils';

export const FormContext = createContext();

export const FormProvider = ({ 
  children, 
  initialGeneratedContent = '', 
  initialEditingMode = false,
  originalLinkData = null
}) => {
  const [value, setValue] = useState(initialGeneratedContent);
  const [isEditing, setIsEditing] = useState(initialEditingMode);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [aiAdjustment, setAiAdjustment] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [highlightedRange, setHighlightedRange] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [adjustmentText, setAdjustmentText] = useState('');
  const [quillInstance, setQuillInstanceInternal] = useState(null);
  const quillRef = useRef(null);
  const setQuillRefCallback = useCallback((instance) => {
    quillRef.current = instance;
    setQuillInstanceInternal(instance);
  }, []);
  const { submitForm, loading, error } = useApiSubmit('/claude_text_adjustment');
  const [originalContent, setOriginalContent] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkData, setLinkData] = useState(originalLinkData);
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState(null);

  // Add State for Europa Mode
  const [useEuropa, setUseEuropa] = useState(false);
  
  // Add state for knowledge entries
  const [selectedKnowledge, setSelectedKnowledge] = useState([]);

  const debouncedSetValue = useMemo(() => 
    debounce((newValue) => {
      setValue(newValue);
      setSyncStatus('synced');
    }, 2000), 
  []);

  const debouncedSetSyncStatus = useMemo(() => 
    debounce(() => {
      setSyncStatus('synced');
    }, 2000), 
  []);

  const updateValue = useCallback((newValue) => {
    console.log('[FormContext] updateValue called. New value length:', newValue?.length);
    setValue(newValue);
    setSyncStatus('synced');
  }, []);

  // Platzhalter-Funktionen, die durch Editor überschrieben werden
  const applyAdjustment = useCallback(() => {
    console.log('[FormContext] applyAdjustment wurde aufgerufen, aber es gibt noch keine Implementierung');
  }, []);

  const rejectAdjustment = useCallback(() => {
    console.log('[FormContext] rejectAdjustment wurde aufgerufen, aber es gibt noch keine Implementierung');
  }, []);

  useEffect(() => {
    if (initialEditingMode) {
      setIsEditing(true);
    }
  }, [initialEditingMode]);

  useEffect(() => {
    setHasContent(!!value);
  }, [value]);
  
  // Navigationswarnungen mit dem Hook verwalten
  useNavigationWarning(hasContent);

  const setGeneratedContent = useCallback((content) => {
    console.log('[FormContext] setGeneratedContent called. Content length:', content?.length);
    setValue(content);
  }, []);

  const handleEdit = useCallback(() => {
    console.log('[FormContext] handleEdit called. Setting isEditing to true.');
    setIsEditing(true);
  }, []);

  const handleSave = useCallback(() => {
    const quill = quillRef.current;
    if (quill) {
      const currentContent = quill.root.innerHTML;
      console.log('[FormContext] handleSave: Reading content from Quill. Length:', currentContent?.length);
      setValue(currentContent);
      setSyncStatus('synced');
    } else {
      console.warn('[FormContext] handleSave: Quill instance not found. Cannot save content.');
    }
    console.log('[FormContext] Setting isEditing to false in handleSave.');
    setIsEditing(false);
  }, [setValue, setIsEditing, setSyncStatus]);

  const handleCancel = useCallback(() => {
    const quill = quillRef.current;
    if (quill && value !== quill.root.innerHTML) {
      console.log('[FormContext] handleCancel: Reverting editor content to last saved state.');
    }
    console.log('[FormContext] handleCancel called. Setting isEditing to false.');
    setIsEditing(false);
  }, [value, setIsEditing]);

  const setQuillInstance = useCallback((quillEditor) => {
    console.log('[FormContext] setQuillInstance called with:', quillEditor);
    setQuillRefCallback(quillEditor);
  }, [setQuillRefCallback]);

  const handleAiAdjustment = useCallback((adjustmentOrState, selectedText) => {
    console.log('[FormContext] handleAiAdjustment', adjustmentOrState, selectedText);
    if (typeof adjustmentOrState === 'boolean') {
      setIsAdjusting(adjustmentOrState);
      setIsApplyingAdjustment(false);
      if (adjustmentOrState) {
        if (selectedText) {
          setOriginalSelectedText(selectedText);
        }
      } else {
        setAdjustmentText('');
        setOriginalSelectedText('');
        setHighlightedRange(null);
      }
    } else if (typeof adjustmentOrState === 'string') {
      setAdjustmentText(adjustmentOrState);
      setIsApplyingAdjustment(false);
    } else if (typeof adjustmentOrState === 'object' && adjustmentOrState?.type) {
      // Behandle verschiedene Typen
      setAiAdjustment(adjustmentOrState);
      setAdjustmentText(adjustmentOrState.newText);
      setIsApplyingAdjustment(false);
    }
  }, []);

  // Add function to handle knowledge selection
  const handleKnowledgeSelection = useCallback((knowledge, knowledgeIdToRemove) => {
    if (knowledgeIdToRemove) {
      // Entfernen einer Wissenseinheit
      setSelectedKnowledge(prev => prev.filter(item => item.id !== knowledgeIdToRemove));
    } else if (knowledge) {
      // Hinzufügen einer Wissenseinheit
      setSelectedKnowledge(prev => [...prev, knowledge]);
    }
  }, []);

  // Add function to clear all selected knowledge
  const clearSelectedKnowledge = useCallback(() => {
    setSelectedKnowledge([]);
  }, []);

  // Add function to get knowledge content for API requests
  const getKnowledgeContent = useCallback(() => {
    if (selectedKnowledge.length === 0) return null;
    
    // Kombiniere den Inhalt aller ausgewählten Wissenseinheiten
    return selectedKnowledge.map(item => {
      return `## ${item.title}\n${item.content}`;
    }).join('\n\n');
  }, [selectedKnowledge]);

  const handleConfirmAdjustment = useCallback(async () => {
    console.log('[FormContext] handleConfirmAdjustment', adjustmentText);
    if (!adjustmentText) return;
    
    setIsApplyingAdjustment(true);
    const quill = quillRef.current;
    try {
      if (aiAdjustment?.type === 'full') {
        if (quill) {
          const delta = quill.clipboard.convert(adjustmentText);
          quill.setContents(delta, 'api');
          updateValue(quill.root.innerHTML);
        }
      } else if (aiAdjustment?.type === 'selected' && highlightedRange) {
        if (quill && highlightedRange) {
          quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
          quill.insertText(highlightedRange.index, adjustmentText, 'api');
          updateValue(quill.root.innerHTML);
        }
      }

      // States zurücksetzen
      setIsAdjusting(false);
      setIsApplyingAdjustment(false);
      setAdjustmentText('');
      setOriginalSelectedText('');
      setHighlightedRange(null);
      setAiAdjustment(null);
    } catch (error) {
      console.error('[FormContext] Error during adjustment:', error);
      setAdjustmentError('Fehler beim Anwenden der Änderungen');
      setTimeout(() => setAdjustmentError(null), 3000);
    } finally {
      setIsApplyingAdjustment(false);
    }
  }, [
    adjustmentText,
    aiAdjustment,
    highlightedRange,
    updateValue,
    setAdjustmentError
  ]);

  const clearAllHighlights = useCallback(() => {
    const quill = quillRef.current;
    if (quill) {
      try {
        removeAllHighlights(quill);
      } catch(err) {
        console.error("Error calling removeAllHighlights:", err);
      }
    }
  }, []);

  const handleAiResponse = useCallback(async (response) => {
    if (response.textAdjustment) {
      setAdjustmentText(response.textAdjustment.newText);
      setAiAdjustment({
        ...response.textAdjustment,
        type: response.textAdjustment.type
      });
      
      // Direkt handleConfirmAdjustment aufrufen statt auf Bestätigung zu warten
      handleConfirmAdjustment();
    }
    return response.response;
  }, [handleConfirmAdjustment]);

  // Cleanup Effect
  useEffect(() => {
    if (!isAdjusting) {
      clearAllHighlights();
      setAdjustmentError(null);
      setAdjustmentText('');
      setOriginalContent('');
      setAiAdjustment(null);
    }
  }, [isAdjusting, clearAllHighlights]);

  const toggleEditMode = useCallback(() => {
    console.log('[FormContext] toggleEditMode called.');
    setIsEditing(prev => {
      console.log(`[FormContext] Changing isEditing from ${prev} to ${!prev}.`);
      return !prev;
    });
  }, []);

  const contextValue = useMemo(() => ({
    value,
    setValue,
    updateValue,
    setGeneratedContent,
    isEditing,
    setIsEditing,
    handleEdit,
    handleSave,
    handleCancel,
    isAdjusting,
    setIsAdjusting,
    aiAdjustment,
    setAiAdjustment,
    handleAiAdjustment,
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    syncStatus,
    setSyncStatus,
    toggleEditMode,
    originalSelectedText,
    setOriginalSelectedText,
    adjustmentText,
    setAdjustmentText,
    handleConfirmAdjustment,
    rejectAdjustment,
    originalContent,
    setOriginalContent,
    removeAllHighlights,
    linkName,
    setLinkName,
    linkData,
    setLinkData,
    setQuillInstance,
    clearAllHighlights,
    isApplyingAdjustment,
    setIsApplyingAdjustment,
    hasContent,
    quillRef: quillRef,
    handleAiResponse,
    adjustmentError,
    setAdjustmentError,
    // Add Europa Mode state and setter to context
    useEuropa,
    setUseEuropa,
    // Add knowledge management
    selectedKnowledge,
    handleKnowledgeSelection,
    clearSelectedKnowledge,
    getKnowledgeContent
  }), [
    value,
    setValue,
    updateValue,
    setGeneratedContent,
    isEditing,
    handleEdit,
    handleSave,
    handleCancel,
    isAdjusting,
    aiAdjustment,
    handleConfirmAdjustment,
    selectedText,
    highlightedRange,
    syncStatus,
    setSyncStatus,
    toggleEditMode,
    originalSelectedText,
    adjustmentText,
    rejectAdjustment,
    originalContent,
    setOriginalContent,
    removeAllHighlights,
    linkName,
    linkData,
    setLinkData,
    setQuillInstance,
    clearAllHighlights,
    isApplyingAdjustment,
    hasContent,
    handleAiResponse,
    adjustmentError,
    setAdjustmentError,
    handleAiAdjustment,
    // Add dependencies for Europa Mode
    useEuropa,
    setUseEuropa,
    // Add dependencies for knowledge management
    selectedKnowledge,
    handleKnowledgeSelection,
    clearSelectedKnowledge,
    getKnowledgeContent
  ]);

  return (
    <FormContext.Provider value={contextValue}>
      {children}
      {adjustmentError && (
        <div className="adjustment-error">
          Fehler: {adjustmentError}
        </div>
      )}
    </FormContext.Provider>
  );
};

FormProvider.propTypes = {
  children: PropTypes.node.isRequired,
  initialGeneratedContent: PropTypes.string,
  initialEditingMode: PropTypes.bool,
  originalLinkData: PropTypes.object,
};

function safeRemoveAllHighlights(quillInstance) {
  if (quillInstance && typeof removeAllHighlights === 'function') {
    removeAllHighlights(quillInstance);
  } else {
    console.warn('removeAllHighlights function not available or quillInstance is null');
  }
}