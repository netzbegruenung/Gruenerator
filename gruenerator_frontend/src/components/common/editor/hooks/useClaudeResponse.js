import { useCallback } from 'react';
import useApiSubmit from '../../../hooks/useApiSubmit';

export const useClaudeResponse = ({ handleAiResponse, quillRef, setOriginalContent, value, setIsAdjusting }) => {
  const { submitForm } = useApiSubmit('/claude_chat');

  const getEditorContent = () => {
    // Primärer Versuch über React Ref
    if (quillRef.current) {
      return quillRef.current.getText();
    }
    
    // Fallback über DOM
    const editorElement = document.querySelector('.ql-editor');
    if (editorElement) {
      return editorElement.innerText;
    }
    
    throw new Error('Editor nicht gefunden');
  };

  const processClaudeRequest = useCallback(async (
    message, 
    selectedText = null, 
    mode = 'edit',
    chatHistory = null
  ) => {
    try {
      // Validiere Eingaben vor API-Aufruf
      if (!message?.trim()) {
        throw new Error('Bitte geben Sie eine Nachricht ein');
      }

      const plainText = getEditorContent();
      if (!plainText?.trim()) {
        throw new Error('Der Editor enthält keinen Text');
      }

      if (selectedText === '') {
        selectedText = null;
      }
      
      if (selectedText !== null && !selectedText?.trim()) {
        throw new Error('Der markierte Text ist ungültig');
      }

      if (mode === 'edit' && selectedText === null) {
        if (quillRef.current) {
          setOriginalContent(quillRef.current.root.innerHTML);
        } else {
          console.warn('[useClaudeResponse] Editor nicht verfügbar, verwende value als Fallback');
          setOriginalContent(value);
        }
      }

      const requestData = {
        message: message.trim(),
        currentText: plainText.trim(),
        ...(selectedText && { selectedText: selectedText.trim() }),
        ...(chatHistory && { chatHistory: chatHistory }),
        mode
      };

      console.log('[useClaudeResponse] Anfrage mit Modus:', mode);

      try {
        if (mode === 'edit') {
          setIsAdjusting(true);
          const response = await submitForm(requestData);
          
          if (response.textAdjustment && 
              response.textAdjustment.type !== 'selected' && 
              response.textAdjustment.type !== 'full') {
            throw new Error('Nicht unterstützter Anpassungstyp: ' + response.textAdjustment.type);
          }
          
          await handleAiResponse(response);
          setIsAdjusting(false);
          return response.response;
        } else if (mode === 'search') {
          const response = await submitForm(requestData);
          return response;
        } else {
          const response = await submitForm(requestData);
          return response.response;
        }
      } catch (error) {
        if (error.response?.data?.code === 'VALIDATION_ERROR') {
          const details = Object.values(error.response.data.details).join(', ');
          throw new Error(`Validierungsfehler: ${details}`);
        }
        throw error;
      }
    } catch (error) {
      console.error('Fehler bei der Textverarbeitung:', {
        message: error.message,
        type: error.name,
        details: error.response?.data
      });
      throw error;
    }
  }, [quillRef, value, setOriginalContent, submitForm, handleAiResponse, setIsAdjusting]);

  return { processClaudeRequest, getEditorContent };
}; 