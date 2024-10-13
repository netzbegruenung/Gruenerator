import React, { createContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { useSupabaseStorage } from '../hooks/useSupabaseStorage'; // Neuer Import

export const FormContext = createContext();

export const FormProvider = ({ children, initialGeneratedContent = '' }) => {
  const [value, setValue] = useState(initialGeneratedContent);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [aiAdjustment, setAiAdjustment] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [highlightedRange, setHighlightedRange] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced'); // Neu hinzugefügt
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [newSelectedText, setNewSelectedText] = useState('');
  const [quillRef, setQuillRef] = useState(null);
  const { submitForm, loading, error } = useApiSubmit('/claude_text_adjustment');
  const [originalContent, setOriginalContent] = useState('');
  const [linkName, setLinkName] = useState(''); // Neuer State für den Link-Namen
  const { saveContent, getContent, listSavedContents, deleteContent, loading: supabaseLoading, error: supabaseError } = useSupabaseStorage(); // Neue Hooks

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
    setValue(newValue); // Direktes Setzen des Wertes
    setSyncStatus('syncing');
    debouncedSetSyncStatus(); // Verzögerte Aktualisierung des Sync-Status
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

  const applyAdjustmentToEditor = useCallback((newText) => {
    if (quillRef.current && highlightedRange) {
      const quill = quillRef.current.getEditor();
      quill.deleteText(highlightedRange.index, highlightedRange.length);
      quill.insertText(highlightedRange.index, newText);
      quill.setSelection(highlightedRange.index + newText.length, 0);
      updateValue(quill.root.innerHTML);
    }
  }, [quillRef, highlightedRange, updateValue]);

  const applyHighlight = useCallback((index, length, color = '#ffff00') => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      quill.formatText(index, length, {
        'background': color,
        'color': color === '#ffff00' ? '#000000' : '#ffffff',
      });
    }
  }, [quillRef]);

  const handleAiAdjustmentCallback = useCallback((adjustmentOrState, originalText = '') => {
    if (typeof adjustmentOrState === 'boolean') {
      setIsAdjusting(adjustmentOrState);
      if (adjustmentOrState) {
        setOriginalContent(value); // Speichern des gesamten Inhalts
        setOriginalSelectedText(originalText);
      }
      console.log(`FormContext: KI-Anpassung: ${adjustmentOrState ? 'gestartet' : 'beendet'}, neuer isAdjusting-Zustand:`, adjustmentOrState);
    } else if (typeof adjustmentOrState === 'string') {
      setNewSelectedText(adjustmentOrState);
      setIsAdjusting(true);
      if (highlightedRange) {
        applyHighlight(highlightedRange.index, highlightedRange.length, '#00ff00');
      }
      console.log('FormContext: Neue KI-Anpassung erhalten, isAdjusting auf true gesetzt');
    }
  }, [value, highlightedRange, applyHighlight]);

  const removeAllHighlights = useCallback(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      quill.formatText(0, quill.getLength(), {
        'background': false,
        'color': false
      });
    }
  }, [quillRef]);

  const handleAcceptAdjustment = useCallback(() => {
    console.log('KI-Anpassung akzeptiert');
    setIsAdjusting(false);
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      applyAdjustmentToEditor(newSelectedText, false);
      updateValue(quill.root.innerHTML);
    }
    setNewSelectedText('');
    removeAllHighlights();
  }, [newSelectedText, updateValue, applyAdjustmentToEditor, removeAllHighlights]);

  const handleRejectAdjustment = useCallback(() => {
    console.log('KI-Anpassung abgelehnt');
    setIsAdjusting(false);
    if (originalContent) {
      setValue(originalContent); // Wiederherstellen des gesamten ursprünglichen Inhalts
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
        // Wenn wir den Bearbeitungsmodus verlassen, speichern wir den aktuellen Wert
        setValue(value);
      }
      console.log('New isEditing state:', !prevState);
      return !prevState;
    });
  }, [value]);

  const adjustText = useCallback(async (adjustmentText, textToAdjust) => {
    try {
      console.log('Sende Anpassungsanfrage:', { adjustmentText, textToAdjust });
      const result = await submitForm({ 
        originalText: textToAdjust, 
        modification: adjustmentText 
      });
      console.log('API-Antwort:', result);
      if (result && result.suggestions && result.suggestions.length > 0) {
        const newText = result.suggestions[0];
        setNewSelectedText(newText);
        console.log('Neuer Text gesetzt:', newText);
        return true;
      }
      console.error('Keine gültigen Vorschläge in der API-Antwort');
      return false;
    } catch (error) {
      console.error('Fehler bei der Textanpassung:', error);
      return false;
    }
  }, [submitForm, setNewSelectedText]);

 

  const handleSaveContent = useCallback(async (content, name) => {
    if (!name.trim()) {
      console.error('Link-Name ist erforderlich');
      return;
    }
    try {
      await saveContent(content, name);
      console.log('Inhalt erfolgreich gespeichert');
      // Hier könnten Sie eine Erfolgsmeldung anzeigen
    } catch (err) {
      console.error('Fehler beim Speichern des Inhalts:', err);
      // Hier könnten Sie eine Fehlermeldung anzeigen
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
        // Hier könnten Sie eine Erfolgsmeldung anzeigen
      } else {
        console.log('Kein Inhalt für diesen Link-Namen gefunden');
        // Hier könnten Sie eine Meldung anzeigen, dass kein Inhalt gefunden wurde
      }
    } catch (err) {
      console.error('Fehler beim Laden des Inhalts:', err);
      // Hier könnten Sie eine Fehlermeldung anzeigen
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
      // Hier könnten Sie eine Erfolgsmeldung anzeigen
    } catch (err) {
      console.error('Fehler beim Löschen des Inhalts:', err);
      // Hier könnten Sie eine Fehlermeldung anzeigen
    }
  }, [deleteContent]);

  const saveCurrentContent = useCallback(async (name, generatedLink) => {
    console.log('saveCurrentContent aufgerufen', { name, generatedLink, value });
    if (!name.trim()) {
      console.error('Link-Name ist erforderlich');
      return { success: false, error: 'Link-Name ist erforderlich' };
    }
    try {
      await saveContent(value, name, generatedLink);
      console.log('Inhalt erfolgreich gespeichert');
      return { success: true };
    } catch (err) {
      console.error('Fehler beim Speichern des Inhalts:', err);
      return { success: false, error: err.message };
    }
  }, [saveContent, value]);

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
    handleAiAdjustment: handleAiAdjustmentCallback,
    handleAcceptAdjustment,
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    syncStatus, // Neu hinzugefügt
    setSyncStatus, // Neu hinzugefügt
    toggleEditMode,
    originalSelectedText,
    setOriginalSelectedText,
    newSelectedText,
    setNewSelectedText,
    handleRejectAdjustment,
    adjustText,
    quillRef,
    setQuillRef,
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
    handleAiAdjustmentCallback,
    handleAcceptAdjustment,
    selectedText,
    highlightedRange,
    syncStatus, // Neu hinzugefügt
    setSyncStatus, // Neu hinzugefügt
    toggleEditMode,
    originalSelectedText,
    newSelectedText,
    handleRejectAdjustment,
    adjustText,
    loading,
    error,
    quillRef,
    setQuillRef,
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
};

export default FormProvider;