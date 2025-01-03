import React, { createContext, useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { removeAllHighlights } from '../utils/highlightUtils';
import { useNavigate, useLocation } from 'react-router-dom';

export const FormContext = createContext();

export const FormProvider = ({ 
  children, 
  initialGeneratedContent = '', 
  initialEditingMode = false,
  originalLinkData = null
}) => {
  const [value, setValue] = useState(initialGeneratedContent);
  const [isEditing, setIsEditing] = useState(initialEditingMode);
  console.log('[FormContext] Initial isEditing Status:', initialEditingMode);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [aiAdjustment, setAiAdjustment] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [highlightedRange, setHighlightedRange] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [newSelectedText, setNewSelectedText] = useState('');
  const [quillRef, setQuillRef] = useState(() => ({ current: null }));
  const { submitForm, loading, error } = useApiSubmit('/claude_text_adjustment');
  const [originalContent, setOriginalContent] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkData, setLinkData] = useState(originalLinkData);
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      setQuillRef({ current: quill });
    }
  }, [setQuillRef]);

  useEffect(() => {
    setHasContent(!!value);
  }, [value]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasContent) {
        const message = 'Wenn Sie diese Seite verlassen, gehen Ihre Änderungen verloren. Möchten Sie die Seite wirklich verlassen?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasContent]);

  useEffect(() => {
    if (!hasContent) return;

    const unlisten = navigate((to) => {
      if (to.pathname === location.pathname) return true;

      const userConfirmed = window.confirm(
        'Wenn Sie diese Seite verlassen, gehen Ihre Änderungen verloren. Möchten Sie die Seite wirklich verlassen?'
      );

      if (userConfirmed) {
        setValue('');
        setHasContent(false);
        return true;
      }
      
      return false;
    });

    return () => unlisten?.();
  }, [hasContent, location.pathname, navigate]);

  useEffect(() => {
    setValue('');
    setHasContent(false);
    setIsEditing(false);
    setIsAdjusting(false);
    setAiAdjustment(null);
    setSelectedText('');
    setHighlightedRange(null);
    setSyncStatus('synced');
  }, [location.pathname]);

  const debouncedSetValue = useMemo(() => 
    debounce((newValue) => {
      console.log('debouncedSetValue ausgeführt:', newValue);
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
    console.log('updateValue aufgerufen:', newValue);
    setValue(newValue);
    setSyncStatus('syncing');
    debouncedSetSyncStatus();
  }, [debouncedSetSyncStatus]);

  const setGeneratedContent = useCallback((content) => {
    console.log('Setze generierten Inhalt:', content);
    setValue(content);
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    console.log('Bearbeitung gestartet');
  }, []);

  const handleSave = useCallback((newContent) => {
    if (newContent !== undefined) {
      setValue(newContent);
    }
    setIsEditing(false);
    console.log('Änderungen gespeichert und Bearbeitung beendet');
  }, []);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    console.log('Bearbeitung abgebrochen');
  }, []);

  const setQuillInstance = useCallback((quillEditor) => {
    setQuillRef({ current: quillEditor });
  }, []);

  const applyAdjustmentToEditor = useCallback((newText) => {
    if (quillRef.current && highlightedRange) {
      const quill = quillRef.current.getEditor();
      quill.deleteText(highlightedRange.index, highlightedRange.length);
      quill.insertText(highlightedRange.index, newText);
      quill.setSelection(highlightedRange.index + newText.length, 0);
      updateValue(quill.root.innerHTML);
    }
  }, [highlightedRange, updateValue]);

  const handleAiAdjustment = useCallback((adjustmentOrState, selectedText) => {
    if (typeof adjustmentOrState === 'boolean') {
      setIsAdjusting(adjustmentOrState);
      setIsApplyingAdjustment(false);
      if (adjustmentOrState) {
        setOriginalSelectedText(selectedText);
      } else {
        setNewSelectedText('');
        setOriginalSelectedText('');
        setHighlightedRange(null);
      }
    } else if (typeof adjustmentOrState === 'string') {
      setNewSelectedText(adjustmentOrState);
      setIsApplyingAdjustment(false);
    }
  }, [setIsAdjusting, setIsApplyingAdjustment, setOriginalSelectedText, setNewSelectedText, setHighlightedRange]);

  const handleAcceptAdjustment = useCallback(() => {
    console.log('KI-Anpassung akzeptiert');
    setIsAdjusting(false);
    setIsApplyingAdjustment(false);
    setNewSelectedText('');
    setOriginalSelectedText('');
    setHighlightedRange(null);
  }, [setIsAdjusting, setIsApplyingAdjustment, setNewSelectedText, setOriginalSelectedText, setHighlightedRange]);

  const handleRejectAdjustment = useCallback(() => {
    console.log('KI-Anpassung abgelehnt');
    setIsAdjusting(false);
    if (originalContent) {
      setValue(originalContent);
      if (quillRef.current) {
        const quill = quillRef.current.getEditor();
        quill.root.innerHTML = originalContent;
      }
    }
    setNewSelectedText('');
    setOriginalContent('');
    removeAllHighlights();
  }, [originalContent, setValue, quillRef, removeAllHighlights]);

  const toggleEditMode = useCallback(() => {
    console.log('[FormContext] Toggle Edit Mode - Vorher:', isEditing);
    setIsEditing(prevState => {
      const newState = !prevState;
      console.log('[FormContext] Toggle Edit Mode - Nachher:', newState);
      if (prevState) {
        setValue(value);
      }
      return newState;
    });
  }, [value]);

  const adjustText = useCallback(async (adjustmentText, textToAdjust) => {
    try {
      console.log('Sende Anpassungsanfrage:', { adjustmentText, textToAdjust, fullText: value });
      const result = await submitForm({ 
        originalText: textToAdjust, 
        modification: adjustmentText,
        fullText: value
      });
      
      console.log('API-Antwort:', result);
      if (result) {
        setNewSelectedText(result);
        console.log('Neuer Text gesetzt:', result);
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      }
      
      console.error('Keine gültigen Vorschläge in der API-Antwort');
      return false;
    } catch (error) {
      console.error('Fehler bei der Textanpassung:', error);
      return false;
    }
  }, [submitForm, setNewSelectedText, value]);

  const clearAllHighlights = useCallback(() => {
    if (quillRef.current) {
      removeAllHighlights(quillRef.current.getEditor());
    }
  }, [quillRef]);

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
    handleAcceptAdjustment,
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    syncStatus,
    setSyncStatus,
    toggleEditMode,
    originalSelectedText,
    setOriginalSelectedText,
    newSelectedText,
    setNewSelectedText,
    handleRejectAdjustment,
    adjustText,
    loading,
    error,
    applyAdjustmentToEditor,
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
    handleAcceptAdjustment,
    selectedText,
    highlightedRange,
    syncStatus,
    setSyncStatus,
    toggleEditMode,
    originalSelectedText,
    newSelectedText,
    handleRejectAdjustment,
    adjustText,
    loading,
    error,
    applyAdjustmentToEditor,
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
  ]);

  useEffect(() => {
    console.log('[FormContext] isEditing Status geändert:', isEditing);
  }, [isEditing]);

  return (
    <FormContext.Provider value={contextValue}>
      {children}
    </FormContext.Provider>
  );
};

FormProvider.propTypes = {
  children: PropTypes.node.isRequired,
  initialGeneratedContent: PropTypes.string,
  initialEditingMode: PropTypes.bool,
  originalLinkData: PropTypes.object,
};

export default FormProvider;