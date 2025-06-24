import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import useNavigationWarning from '../common/editor/hooks/useNavigationWarning';
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
  }, [setValue]);

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

  const handleAiAdjustment = useCallback((adjustmentOrState, currentSelectedTextByUser) => {
    console.log('[FormContext] handleAiAdjustment: ', adjustmentOrState, 'Selected by user:', currentSelectedTextByUser);
    if (typeof adjustmentOrState === 'boolean') {
      setIsAdjusting(adjustmentOrState);
      setIsApplyingAdjustment(false);
      if (adjustmentOrState && currentSelectedTextByUser) {
        setOriginalSelectedText(currentSelectedTextByUser);
      }
       // When stopping adjustment, clear these states
      if (!adjustmentOrState) {
        setAdjustmentText('');
        setOriginalSelectedText('');
        // highlightedRange is managed by editor selection, don't clear it here necessarily
        // setHighlightedRange(null); 
        setAiAdjustment(null); // Clear AI adjustment details
      }
    } else if (typeof adjustmentOrState === 'string') { // Direct text from AI, to be applied
      setAdjustmentText(adjustmentOrState);
      setIsApplyingAdjustment(false); // Ready to be applied
    } else if (typeof adjustmentOrState === 'object' && adjustmentOrState?.type) { // Full AI adjustment object
      setAiAdjustment(adjustmentOrState); // Store the full AI adjustment object
      setAdjustmentText(adjustmentOrState.newText); // Store the new text to be applied
      setIsApplyingAdjustment(false); // Ready to be applied
    
    }
  }, [/* Removed setIsAdjusting from deps as it's part of the same hook */]);

  const handleConfirmAdjustment = useCallback(async () => {
    console.log('[FormContext] handleConfirmAdjustment. Adjustment Text:', adjustmentText, 'AI Adjustment Object:', aiAdjustment);
    if (!adjustmentText && !(aiAdjustment && aiAdjustment.newText)) {
        console.warn('[FormContext] No adjustment text to apply.');
        return;
    }
    
    setIsApplyingAdjustment(true);
    const quill = quillRef.current;
    const textToApply = aiAdjustment?.newText || adjustmentText; // Prefer newText from aiAdjustment object

    try {
      if (!quill) {
        console.error('[FormContext] Quill instance not available for applying adjustment.');
        throw new Error('Editor nicht verfügbar.');
      }

      if (aiAdjustment?.type === 'full') {
        console.log('[FormContext] Applying full text adjustment.');
        const delta = quill.clipboard.convert(textToApply);
        quill.setContents(delta, 'api');
        updateValue(quill.root.innerHTML);
      } else if (aiAdjustment?.type === 'selected') {
        const rangeToUse = aiAdjustment.range; // Directly use range from AI adjustment

        if (rangeToUse && typeof rangeToUse.index === 'number' && typeof rangeToUse.length === 'number') {
          console.log('[FormContext] Applying selected text adjustment using AI-provided range:', rangeToUse);
          quill.deleteText(rangeToUse.index, rangeToUse.length, 'api');
          quill.insertText(rangeToUse.index, textToApply, 'api');
          updateValue(quill.root.innerHTML);
        } else if (highlightedRange && typeof highlightedRange.index === 'number' && typeof highlightedRange.length === 'number') {
          // Fallback for user-highlighted selections if AI range is somehow not provided (should not happen with new backend logic)
          console.warn('[FormContext] AI-provided range missing for type \'selected\', falling back to user highlightedRange:', highlightedRange);
          quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
          quill.insertText(highlightedRange.index, textToApply, 'api');
          updateValue(quill.root.innerHTML);
        } else {
          console.error('[FormContext] No valid range found for applying \'selected\' type adjustment.');
          throw new Error('Kein gültiger Bereich für die Textanpassung gefunden.');
        }
      } else {
 
        if (highlightedRange) {
            console.log('[FormContext] Applying adjustment to user highlightedRange (default behavior): ', highlightedRange);
            quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
            quill.insertText(highlightedRange.index, textToApply, 'api');
            updateValue(quill.root.innerHTML);
        } else {
            console.warn('[FormContext] No specific adjustment type and no highlighted range. Cannot apply adjustment text: ', textToApply.substring(0,100));
      
        }
      }

      // Reset states after successful application
      setIsAdjusting(false);
      setAdjustmentText('');
      setOriginalSelectedText('');
      // setHighlightedRange(null); // User selection should clear naturally or be managed by editor events
      setAiAdjustment(null);
      if (quill) removeAllHighlights(quill); // Clear any visual highlights

    } catch (error) {
      console.error('[FormContext] Error during adjustment application:', error);
      setAdjustmentError(error.message || 'Fehler beim Anwenden der Änderungen.');
      // Do not reset isAdjusting here, user might want to retry or cancel
    } finally {
      setIsApplyingAdjustment(false);
    }
  }, [
    adjustmentText, 
    aiAdjustment, 
    highlightedRange, 
    updateValue, 
    removeAllHighlights, 
    setIsAdjusting, 
    setAdjustmentText, 
    setOriginalSelectedText, 
    setAiAdjustment,
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
  }, [/* quillRef.current used */]);

  const handleAiResponse = useCallback(async (response) => {
    console.log("[FormContext] handleAiResponse received:", response);
    if (response && response.textAdjustment) {

      handleAiAdjustment(response.textAdjustment);
      
      handleConfirmAdjustment(); 
    } else if (response && response.response && !response.textAdjustment) {

      console.log("[FormContext] Received chat response without text adjustment.");
    }
    // Return the chat part of the response for EditorChat to display
    return response.response; 
  }, [handleAiAdjustment, handleConfirmAdjustment]);

  // Cleanup Effect
  useEffect(() => {
    if (!isAdjusting) {
      // clearAllHighlights(); // Highlights are cleared on confirm/reject or by editor itself
      setAdjustmentError(null);
      // Do not clear adjustmentText or aiAdjustment here, they are cleared on confirm/reject or when setIsAdjusting(false)
    }
  }, [isAdjusting, /* clearAllHighlights, */ setAdjustmentError]);

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
    updateValue,
    isEditing, setIsEditing,
    handleEdit,
    handleSave,
    handleCancel,
    isAdjusting, setIsAdjusting,
    aiAdjustment, setAiAdjustment,
    handleAiAdjustment,
    selectedText, setSelectedText,
    highlightedRange, setHighlightedRange,
    syncStatus, setSyncStatus,
    toggleEditMode,
    originalSelectedText, setOriginalSelectedText,
    adjustmentText, setAdjustmentText,
    handleConfirmAdjustment,
    originalContent, setOriginalContent,
    removeAllHighlights,
    linkName, setLinkName,
    linkData, setLinkData,
    setQuillInstance,
    clearAllHighlights,
    isApplyingAdjustment, setIsApplyingAdjustment,
    hasContent,
    quillRef,
    handleAiResponse,
    adjustmentError, setAdjustmentError
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