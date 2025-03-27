import { useContext, useCallback } from 'react';
import { FormContext } from '../../../utils/FormContext';
import useApiSubmit from '../../../hooks/useApiSubmit';

export const useClaudeResponse = () => {
  const { handleAiResponse, quillRef, setOriginalContent, value, setIsAdjusting } = useContext(FormContext);
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

  const processClaudeRequest = useCallback(async (
    message, 
    selectedText = null, 
    mode = 'edit',
    chatHistory = null // Neuer Parameter
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

      // Wenn selectedText vorhanden ist UND leer, dann setzen wir ihn auf null
      // Dadurch wird der full-Modus verwendet
      if (selectedText === '') {
        selectedText = null;
      }
      
      // Nur validieren, wenn ein selectedText übergeben wurde
      if (selectedText !== null && !selectedText?.trim()) {
        throw new Error('Der markierte Text ist ungültig');
      }

      // Im Edit-Modus speichern wir den Originalinhalt für mögliche Änderungen
      if (mode === 'edit' && selectedText === null) {
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
        ...(selectedText && { selectedText: selectedText.trim() }),
        ...(chatHistory && { chatHistory: chatHistory }), // Chathistorie hinzufügen
        mode
      };

      console.log('[useClaudeResponse] Anfrage mit Modus:', mode);

      try {
        // Je nach Modus unterschiedlich verarbeiten
        if (mode === 'edit') {
          // Im Edit-Modus wie bisher den Anpassungsprozess starten
          setIsAdjusting(true);
          const response = await submitForm(requestData);
          
          // Stelle sicher, dass der Typ entweder "selected" oder "full" ist
          if (response.textAdjustment && 
              response.textAdjustment.type !== 'selected' && 
              response.textAdjustment.type !== 'full') {
            throw new Error('Nicht unterstützter Anpassungstyp: ' + response.textAdjustment.type);
          }
          
          await handleAiResponse(response);
          setIsAdjusting(false);
          return response.response;
        } else if (mode === 'search') {
          // Im Search-Modus das gesamte Response-Objekt zurückgeben
          const response = await submitForm(requestData);
          return response; // Gibt das vollständige Objekt zurück
        } else {
          // Im Think-Modus nur die Antwort zurückgeben ohne Textänderungen
          const response = await submitForm(requestData);
          return response.response;
        }
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
  }, [quillRef, value, setOriginalContent, submitForm, handleAiResponse, setIsAdjusting]);

  return { processClaudeRequest, getEditorContent };
}; 