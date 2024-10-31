import React, { createContext, useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { useSupabaseStorage } from '../hooks/useSupabaseStorage';
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
  const { saveContent, getContent, listSavedContents, deleteContent, loading: supabaseLoading, error: supabaseError } = useSupabaseStorage();
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
      setIsApplyingAdjustment(false); // Immer auf false setzen, wenn der Zustand geändert wird
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
    console.log('Toggling edit mode');
    setIsEditing(prevState => {
      if (prevState) {
        setValue(value);
      }
      console.log('New isEditing state:', !prevState);
      return !prevState;
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
      if (result && result.suggestions && result.suggestions.length > 0) {
        const newText = result.suggestions[0];
        setNewSelectedText(newText);
        console.log('Neuer Text gesetzt:', newText);
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

  const handleSaveContent = useCallback(async (content, name) => {
    if (!name.trim()) {
      console.error('Link-Name ist erforderlich');
      return;
    }
    try {
      await saveContent(content, name);
      console.log('Inhalt erfolgreich gespeichert');
    } catch (err) {
      console.error('Fehler beim Speichern des Inhalts:', err);
    }
  }, [saveContent]);

  const handleLoadContent = useCallback(async (name) => {
    if (!name.trim()) {
      console.error('Link-Name ist erforderlich');
      return;
    }
    try {
      const content = await getContent(name);
      if (content) {
        setValue(content);
        console.log('Inhalt erfolgreich geladen');
      } else {
        console.log('Kein Inhalt für diesen Link-Namen gefunden');
      }
    } catch (err) {
      console.error('Fehler beim Laden des Inhalts:', err);
    }
  }, [getContent, setValue]);

  const handleListSavedContents = useCallback(async () => {
    try {
      const savedContents = await listSavedContents();
      console.log('Gespeicherte Inhalte:', savedContents);
      return savedContents;
    } catch (err) {
      console.error('Fehler beim Auflisten der gespeicherten Inhalte:', err);
      return [];
    }
  }, [listSavedContents]);

  const handleDeleteContent = useCallback(async (name) => {
    try {
      await deleteContent(name);
      console.log('Inhalt erfolgreich gelöscht');
    } catch (err) {
      console.error('Fehler beim Löschen des Inhalts:', err);
    }
  }, [deleteContent]);

  const saveCurrentContent = useCallback(async (name, generatedLink) => {
    console.log('saveCurrentContent aufgerufen', { name, generatedLink, value });
    if (!name.trim()) {
      console.error('Link-Name ist erforderlich');
      return { success: false, error: 'Link-Name ist erforderlich' };
    }
    try {
      if (linkData) {
        await saveContent(value, linkData.linkName, linkData.generatedLink);
      } else {
        await saveContent(value, name, generatedLink);
      }
      console.log('Inhalt erfolgreich gespeichert');
      return { success: true };
    } catch (err) {
      console.error('Fehler beim Speichern des Inhalts:', err);
      return { success: false, error: err.message };
    }
  }, [saveContent, value, linkData]);

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
    handleSaveContent,
    handleLoadContent,
    handleListSavedContents,
    handleDeleteContent,
    supabaseLoading,
    supabaseError,
    saveCurrentContent,
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
    handleSaveContent,
    handleLoadContent,
    handleListSavedContents,
    handleDeleteContent,
    supabaseLoading,
    supabaseError,
    saveCurrentContent,
    linkData,
    setLinkData,
    setQuillInstance,
    clearAllHighlights,
    isApplyingAdjustment,
    hasContent,
  ]);

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