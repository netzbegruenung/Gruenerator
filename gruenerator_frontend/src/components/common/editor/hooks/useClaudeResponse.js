import { useContext } from 'react';
import { FormContext } from '../../../utils/FormContext';
import useApiSubmit from '../../../hooks/useApiSubmit';

export const useClaudeResponse = () => {
  const { handleAiResponse, quillRef, setOriginalContent, value } = useContext(FormContext);
  const { submitForm } = useApiSubmit('/claude_chat');

  const getEditorContent = () => {
    // Primärer Versuch über React Ref
    if (quillRef.current?.getEditor()) {
      return quillRef.current.getEditor().getText();
    }
    
    // Fallback über DOM
    const editorElement = document.querySelector('.ql-editor');
    if (editorElement) {
      return editorElement.innerText;
    }
    
    throw new Error('Editor nicht gefunden');
  };

  const processClaudeRequest = async (message, selectedText = null) => {
    try {
      // Validiere Eingaben vor API-Aufruf
      if (!message?.trim()) {
        throw new Error('Bitte geben Sie eine Nachricht ein');
      }

      const plainText = getEditorContent();
      if (!plainText?.trim()) {
        throw new Error('Der Editor enthält keinen Text');
      }

      // Wenn selectedText vorhanden ist UND leer, dann setzen wir ihn auf null
      // Dadurch wird der full-Modus verwendet
      if (selectedText === '') {
        selectedText = null;
      }
      
      // Nur validieren, wenn ein selectedText übergeben wurde
      if (selectedText !== null && !selectedText?.trim()) {
        throw new Error('Der markierte Text ist ungültig');
      }

      // Für full-type (selectedText ist null) speichern wir den Originalinhalt hier
      if (selectedText === null) {
        // Den tatsächlichen HTML-Inhalt des Editors speichern:
        if (quillRef.current?.getEditor()) {
          setOriginalContent(quillRef.current.getEditor().root.innerHTML);
        } else {
          // Fallback auf value, falls Editor nicht verfügbar
          console.warn('[useClaudeResponse] Editor nicht verfügbar, verwende value als Fallback');
          setOriginalContent(value);
        }
      }

      const requestData = {
        message: message.trim(),
        currentText: plainText.trim(),
        ...(selectedText && { selectedText: selectedText.trim() })
      };

      try {
        const response = await submitForm(requestData);
        
        // Stelle sicher, dass der Typ entweder "selected" oder "full" ist
        if (response.textAdjustment && 
            response.textAdjustment.type !== 'selected' && 
            response.textAdjustment.type !== 'full') {
          throw new Error('Nicht unterstützter Anpassungstyp: ' + response.textAdjustment.type);
        }
        
        await handleAiResponse(response);
        return response.response;
      } catch (error) {
        // Behandle API-spezifische Fehler
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
  };

  return { processClaudeRequest, getEditorContent };
}; 