import { useCallback } from 'react';
import useApiSubmit from '../../../hooks/useApiSubmit';

export const useClaudeResponse = ({ handleAiResponse, quillRef, setOriginalContent, value, setIsAdjusting }) => {
  const { submitForm } = useApiSubmit('/claude_chat');

  const getEditorContent = useCallback(() => {
    if (quillRef.current && typeof quillRef.current.getText === 'function') {
      return quillRef.current.getText();
    }
    // Fallback to .ql-editor is problematic for index consistency.
    // Prefer to clearly indicate if Quill instance is not available for getText().
    console.warn('[useClaudeResponse] Quill instance or getText() method not available. Cannot reliably get editor plain text. Returning empty string.');
    // const editorElement = document.querySelector('.ql-editor');
    // if (editorElement) {
    //   console.warn('[useClaudeResponse] Falling back to .ql-editor.innerText. This might lead to inconsistencies.');
    //   return editorElement.innerText;
    // }
    return ''; // Return empty string or handle error as appropriate
  }, [quillRef]);

  const processClaudeRequest = useCallback(async (
    message, 
    selectedText = null, 
    processingMode = 'thinkGlobal', // 'editSelected', 'thinkGlobal', 'searchExplicit'
    chatHistory = null
  ) => {
    try {
      if (!message?.trim()) {
        // This basic validation can stay, or be handled by UI enabling/disabling submit
        throw new Error('Bitte geben Sie eine Nachricht ein');
      }

      let plainText = '';
      // currentText is needed for 'thinkGlobal' and 'editSelected'
      if (processingMode === 'thinkGlobal' || processingMode === 'editSelected') {
        plainText = getEditorContent();
        if (!plainText?.trim()) {
          // For 'thinkGlobal', an empty editor might be acceptable if the question is general.
          // For 'editSelected', it's an issue if selectedText was derived from an empty/whitespace editor.
          if (processingMode === 'editSelected') {
             throw new Error('Der Editor enthält keinen Text für den Bearbeitungsmodus.');
          }
          // For thinkGlobal, we might allow proceeding if the message is a general query not tied to specific content.
          console.warn('[useClaudeResponse] Editor content is empty for thinkGlobal mode.');
        }
      }

      // Normalize selectedText: null if empty or whitespace
      const currentSelectedText = selectedText && selectedText.trim().length > 0 ? selectedText.trim() : null;

      if (processingMode === 'editSelected' && !currentSelectedText) {
        throw new Error('Für den Modus "editSelected" ist markierter Text erforderlich.');
      }
      
      // Set original content for 'editSelected' mode for potential undo/comparison
      if (processingMode === 'editSelected') {
        if (quillRef.current) {
          setOriginalContent(quillRef.current.root.innerHTML);
        } else {
          console.warn('[useClaudeResponse] Editor nicht verfügbar, verwende value als Fallback für Originalinhalt.');
          setOriginalContent(value); // `value` here refers to the prop passed to useClaudeResponse
        }
      }

      const requestData = {
        message: message.trim(),
        mode: processingMode,
        ...(chatHistory && { chatHistory: chatHistory }),
      };

      if (processingMode === 'thinkGlobal' || processingMode === 'editSelected') {
        requestData.currentText = plainText.trim();
      }
      if (currentSelectedText) { // Send selectedText if it's valid, regardless of mode (backend will decide if it uses it)
        requestData.selectedText = currentSelectedText;
      }

      console.log('[useClaudeResponse] Anfrage mit Modus:', processingMode, 'Request Data:', requestData);

      const backendResponse = await submitForm(requestData);
      
      console.log('[useClaudeResponse] Received full response from submitForm:', backendResponse);

      // Handle response based on the processingMode or responseType from backend
      if (processingMode === 'editSelected') {
        if (!backendResponse.textAdjustment || (backendResponse.textAdjustment.type !== 'selected' && backendResponse.textAdjustment.type !== 'full')) {
          // 'full' might still be a potential response from Claude even if we aimed for 'selected'
          console.error('[useClaudeResponse] Invalid textAdjustment in response for editSelected:', backendResponse);
          throw new Error('Ungültige Textanpassung vom Server für editSelected erhalten.');
        }
        setIsAdjusting(true);
        await handleAiResponse(backendResponse); 
        setIsAdjusting(false);
        return backendResponse;
      } else if (processingMode === 'searchExplicit') {
        // Expecting { responseType: 'searchResults', response: ["link_md1"], textAdjustment: null }
        if (backendResponse.responseType !== 'searchResults') {
            console.error('[useClaudeResponse] Unexpected response for searchExplicit:', backendResponse);
            throw new Error('Unerwartete Antwort vom Server für die explizite Suche.');
        }
        return backendResponse; 
      } else { // 'thinkGlobal' (or any other future modes that don't involve direct textAdjustment like editSelected)
        // For thinkGlobal, if it used a tool that resulted in a textAdjustment, handle it.
        if (backendResponse.textAdjustment) {
          setIsAdjusting(true); // Set isAdjusting before calling handleAiResponse
          await handleAiResponse(backendResponse); // Call the passed-in handleAiResponse to apply text adjustment
          setIsAdjusting(false); // Reset isAdjusting after handling
        }
        // Always return the full response for EditorChat to get chat messages or other data
        return backendResponse; 
      }
    } catch (error) {
      console.error('[useClaudeResponse] Fehler bei der Textverarbeitung:', {
        message: error.message,
        type: error.name,
        details: error.response?.data,
        stack: error.stack
      });
      // Re-throw to be caught by the calling component (EditorChat)
      throw error; 
    }
  }, [quillRef, value, setOriginalContent, submitForm, handleAiResponse, setIsAdjusting]);

  return { processClaudeRequest, getEditorContent };
}; 