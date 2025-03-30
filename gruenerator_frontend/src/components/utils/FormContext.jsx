import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { useNavigationWarning } from '../common/editor/hooks';
import { removeAllHighlights, applyNewTextHighlight } from '../common/editor/utils';

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
  const [quillRef, setQuillRef] = useState(() => ({ current: null }));
  const { submitForm, loading, error } = useApiSubmit('/claude_text_adjustment');
  const [originalContent, setOriginalContent] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkData, setLinkData] = useState(originalLinkData);
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState(null);

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
    setValue(newValue);
    setSyncStatus('syncing');
    debouncedSetSyncStatus();
  }, [debouncedSetSyncStatus]);

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
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      setQuillRef({ current: quill });
    }
  }, [setQuillRef]);

  useEffect(() => {
    setHasContent(!!value);
  }, [value]);
  
  // Navigationswarnungen mit dem Hook verwalten
  useNavigationWarning(hasContent);

  const setGeneratedContent = useCallback((content) => {
    setValue(content);
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleSave = useCallback((newContent) => {
    if (newContent !== undefined) {
      setValue(newContent);
    }
    setIsEditing(false);
  }, []);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const setQuillInstance = useCallback((quillEditor) => {
    setQuillRef({ current: quillEditor });
  }, []);

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

  const handleConfirmAdjustment = useCallback(async () => {
    console.log('[FormContext] handleConfirmAdjustment', adjustmentText);
    if (!adjustmentText) return;
    
    setIsApplyingAdjustment(true);
    try {
      if (aiAdjustment?.type === 'full') {
        const quill = quillRef.current?.getEditor();
        if (quill) {
          // Statt applyAdjustment direkt Text setzen und Wert aktualisieren
          quill.setText(adjustmentText);
          updateValue(quill.root.innerHTML);
        }
      } else if (aiAdjustment?.type === 'selected' && highlightedRange) {
        const quill = quillRef.current?.getEditor();
        if (quill && highlightedRange) {
          // Text im markierten Bereich ersetzen
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
    quillRef,
    updateValue,
    setAdjustmentError
  ]);

  const clearAllHighlights = useCallback(() => {
    if (quillRef.current) {
      removeAllHighlights(quillRef.current.getEditor());
    }
  }, [quillRef]);

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
      removeAllHighlights();
      setAdjustmentError(null);
      setAdjustmentText('');
      setOriginalContent('');
      setAiAdjustment(null);
    }
  }, [isAdjusting]);

  const toggleEditMode = useCallback(() => {
    setIsEditing(prev => !prev);
  }, []);

  const contextValue = useMemo(() => ({
    value,
    setValue: debouncedSetValue,
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
    quillRef,
    handleAiResponse,
    adjustmentError,
    setAdjustmentError
  }), [
    value,
    debouncedSetValue,
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
    quillRef,
    handleAiResponse,
    adjustmentError,
    setAdjustmentError
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