import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import useApiSubmit from '../hooks/useApiSubmit';
import { useNavigationWarning } from '../common/editor/hooks';
import { removeAllHighlights } from '../common/editor/utils/highlightUtils';
import useKnowledge from '../hooks/useKnowledge';
import useGroupKnowledgeItems from '../../features/groups/hooks/useGroupKnowledgeItems';

export const FormContext = createContext();

// Define initial config for knowledge source
const initialKnowledgeSourceConfig = { type: 'neutral', id: null, name: 'Neutral', loadedKnowledgeItems: [] };

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
  
  // State for knowledge source configuration
  const [knowledgeSourceConfig, setKnowledgeSourceConfigState] = useState(initialKnowledgeSourceConfig);

  // Fetch user knowledge
  const { availableKnowledge: userKnowledge, isLoading: isLoadingUserKnowledge } = useKnowledge();
  
  // Fetch group knowledge - needs groupId from knowledgeSourceConfig
  const { groupKnowledge, isLoading: isLoadingGroupKnowledge } = useGroupKnowledgeItems(
    knowledgeSourceConfig.type === 'group' ? knowledgeSourceConfig.id : null,
    knowledgeSourceConfig.type === 'group' // enabled if type is group and id is present
  );

  useEffect(() => {
    // Dieser Effect reagiert auf Änderungen in type/id/name (aus dem State)
    // oder auf Änderungen in den Quelldaten (userKnowledge, groupKnowledge)
    console.log('[FormContext] useEffect for loading knowledge triggered. Current config (type/id/name):', 
                knowledgeSourceConfig.type, knowledgeSourceConfig.id, knowledgeSourceConfig.name);

    let newLoadedItems;
    if (knowledgeSourceConfig.type === 'user' && userKnowledge) {
      newLoadedItems = userKnowledge;
      console.log('[FormContext] Loading user knowledge. Items count:', newLoadedItems.length);
    } else if (knowledgeSourceConfig.type === 'group' && knowledgeSourceConfig.id && groupKnowledge) {
      newLoadedItems = groupKnowledge;
      console.log('[FormContext] Loading group knowledge for group', knowledgeSourceConfig.id, '. Items count:', newLoadedItems.length);
    } else {
      newLoadedItems = [];
      if (knowledgeSourceConfig.type !== 'neutral') {
        console.log('[FormContext] Clearing loaded knowledge for type:', knowledgeSourceConfig.type);
      }
    }

    // Nur aktualisieren, wenn sich die geladenen Items tatsächlich ändern
    setKnowledgeSourceConfigState(currentConfig => {
      // Vergleiche die neuen Items mit den bereits im State vorhandenen
      // Dies vermeidet einen Loop, wenn userKnowledge/groupKnowledge sich nicht geändert hat
      // aber der Effect durch type/id/name Änderung getriggert wurde.
      if (currentConfig.loadedKnowledgeItems === newLoadedItems) {
        // console.log('[FormContext] loadedKnowledgeItems are the same, skipping update.');
        return currentConfig;
      }
      // console.log('[FormContext] Updating loadedKnowledgeItems.');
      return {
        ...currentConfig, // currentConfig hat bereits den korrekten type, id, name
        loadedKnowledgeItems: newLoadedItems,
      };
    });
  }, [
    knowledgeSourceConfig.type,
    knowledgeSourceConfig.id,
    knowledgeSourceConfig.name, // Behalten, um auf explizite Namensänderungen zu reagieren, falls relevant
    userKnowledge,
    groupKnowledge,
    // setKnowledgeSourceConfigState ist nicht nötig
  ]);


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
       // If the AI provides a range, it might not correspond to a user highlight.
      // We don't set originalSelectedText or highlightedRange from AI-provided range here.
      // originalSelectedText is for user selection, highlightedRange is for user highlight.
    }
  }, [/* Removed setIsAdjusting from deps as it's part of the same hook */]);

  // Function to set knowledge source configuration
  // This function now only sets the type, id, and name.
  // The actual loading of knowledge items is handled by the useEffect above.
  const setKnowledgeSourceConfig = useCallback((configUpdate) => {
    // configUpdate is { type, id, name }
    console.log('[FormContext] setKnowledgeSourceConfig called with:', configUpdate);
    setKnowledgeSourceConfigState(prevConfig => ({
      ...prevConfig, // Behält andere mögliche Eigenschaften von prevConfig
      ...configUpdate, // Überschreibt type, id, name
      loadedKnowledgeItems: [], // Immer leeren, useEffect lädt neu
    }));
  }, []);
  
  // Function to get knowledge content for API requests
  const getKnowledgeContent = useCallback(() => {
    if (!knowledgeSourceConfig.loadedKnowledgeItems || knowledgeSourceConfig.loadedKnowledgeItems.length === 0) {
      return null;
    }
    // Kombiniere den Inhalt aller geladenen Wissenseinheiten
    return knowledgeSourceConfig.loadedKnowledgeItems.map(item => {
      return `## ${item.title}\\n${item.content}`;
    }).join('\\n\\n');
  }, [knowledgeSourceConfig.loadedKnowledgeItems]);

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
        // This handles both user-selected text (where highlightedRange would be set by user interaction)
        // AND AI-determined ranges (where aiAdjustment.range is provided by the backend).
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
        // Fallback or default behavior if aiAdjustment.type is not 'full' or 'selected'
        // This might be where simple string `adjustmentText` (if no `aiAdjustment` object) could be handled,
        // e.g., by replacing current user selection if `highlightedRange` is available.
        if (highlightedRange) {
            console.log('[FormContext] Applying adjustment to user highlightedRange (default behavior): ', highlightedRange);
            quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
            quill.insertText(highlightedRange.index, textToApply, 'api');
            updateValue(quill.root.innerHTML);
        } else {
            console.warn('[FormContext] No specific adjustment type and no highlighted range. Cannot apply adjustment text: ', textToApply.substring(0,100));
            // Potentially, this could be an instruction to append or prepend if no selection/range.
            // For now, we do nothing if no range is specified.
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
    /* Removed quillRef from here as it's a ref, its .current is used */
    // Added setIsAdjusting, setAdjustmentText etc. as they are setters from useState
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
      // The backend now directly provides the full textAdjustment object
      // including type, newText, and range (if type is 'selected')
      handleAiAdjustment(response.textAdjustment);
      
      // Call handleConfirmAdjustment to apply it.
      // Ensure that handleConfirmAdjustment has access to the latest aiAdjustment state.
      // It might be better to pass the adjustment directly or ensure state update is processed.
      // For now, relying on the state update from handleAiAdjustment then calling confirm.
      handleConfirmAdjustment(); 
    } else if (response && response.response && !response.textAdjustment) {
      // This is a chat message from Claude without a text adjustment (e.g., after a tool error or pure chat)
      // The message will be displayed by EditorChat. No action needed here for text content.
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
    setGeneratedContent,
    isEditing,
    setIsEditing,
    handleEdit,
    handleSave,
    handleCancel,
    isAdjusting,
    setIsAdjusting, // Important to pass this down
    aiAdjustment, 
    setAiAdjustment, // Pass setter
    handleAiAdjustment, // Pass main handler
    selectedText, 
    setSelectedText,
    highlightedRange, 
    setHighlightedRange,
    syncStatus, 
    setSyncStatus,
    toggleEditMode,
    originalSelectedText, 
    setOriginalSelectedText, // Pass setter
    adjustmentText, 
    setAdjustmentText, // Pass setter
    handleConfirmAdjustment, // Pass main handler
    // rejectAdjustment, // Ensure rejectAdjustment is defined or removed if not used
    originalContent, 
    setOriginalContent, // Pass setter
    removeAllHighlights, // Utility
    linkName, 
    setLinkName,
    linkData, 
    setLinkData,
    setQuillInstance, // Callback to set quillRef
    clearAllHighlights, // Utility, though removeAllHighlights might be more specific
    isApplyingAdjustment, 
    setIsApplyingAdjustment, // Pass setter
    hasContent,
    quillRef: quillRef, // Expose the ref itself for direct use if needed
    handleAiResponse, // Main AI response handler
    adjustmentError, 
    setAdjustmentError, // Pass setter
    useEuropa, 
    setUseEuropa,
    knowledgeSourceConfig, 
    setKnowledgeSourceConfig, 
    getKnowledgeContent
  }), [
    value,
    updateValue, // Removed setValue as updateValue is preferred
    setGeneratedContent,
    isEditing, setIsEditing, // Added setIsEditing
    handleEdit,
    handleSave,
    handleCancel,
    isAdjusting, setIsAdjusting, // Added setIsAdjusting again for clarity
    aiAdjustment, setAiAdjustment, // Added setter
    handleAiAdjustment,
    selectedText, setSelectedText, // Added setter
    highlightedRange, setHighlightedRange, // Added setter
    syncStatus, setSyncStatus, // Added setter
    toggleEditMode,
    originalSelectedText, setOriginalSelectedText, // Added setter
    adjustmentText, setAdjustmentText, // Added setter
    handleConfirmAdjustment,
    // rejectAdjustment,
    originalContent, setOriginalContent, // Added setter
    removeAllHighlights,
    linkName, setLinkName, // Added setter
    linkData, setLinkData, // Added setter
    setQuillInstance,
    clearAllHighlights,
    isApplyingAdjustment, setIsApplyingAdjustment, // Added setter
    hasContent,
    quillRef,
    handleAiResponse,
    adjustmentError, setAdjustmentError, // Added setter
    useEuropa, setUseEuropa, // Added setter
    knowledgeSourceConfig, setKnowledgeSourceConfig, // Added setter
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