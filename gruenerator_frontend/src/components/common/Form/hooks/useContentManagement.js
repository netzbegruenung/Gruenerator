import { useEffect, useContext } from 'react';
import { FormContext } from '../context';

/**
 * Hook für die Verwaltung von Inhalten in Formularen
 * @param {string} initialContent - Initialer Inhalt
 * @returns {Object} Inhaltszustand und Funktionen
 */
const useContentManagement = (initialContent = '') => {
  const {
    value,
    updateValue,
    isEditing,
    toggleEditMode,
    setWelcomeMessage,
    welcomeMessage
  } = useContext(FormContext);

  // Setze initialContent in value, falls vorhanden
  useEffect(() => {
    if (initialContent) {
      updateValue(initialContent);
    }
  }, [initialContent, updateValue]);

  // Funktion zum Aktualisieren des Inhalts mit generiertem Content
  const updateWithGeneratedContent = (generatedContent) => {
    if (!generatedContent) return;

    // Prüfe, ob generatedContent ein Objekt mit content und welcomeMessage ist
    if (typeof generatedContent === 'object' && 'content' in generatedContent) {
      // Extrahiere Content und Welcome Message
      const { content, welcomeMessage: newWelcomeMessage } = generatedContent;
      
      // Setze den Content
      if (content && (!value || shouldUpdateValue(content))) {
        updateValue(content);
      }
      
      // Setze die Welcome Message, falls vorhanden
      if (newWelcomeMessage) {
        setWelcomeMessage(newWelcomeMessage);
      }
      
      return;
    }

    // Wenn value leer ist, setze generatedContent
    if (!value || shouldUpdateValue(generatedContent)) {
      updateValue(generatedContent);
    }
  };
  
  // Hilfsfunktion, die prüft, ob value aktualisiert werden sollte
  const shouldUpdateValue = (newContent) => {
    // Wenn newContent SUCHERGEBNIS oder ANTRAG enthält, während value diese nicht enthält
    return (
      (newContent.includes('SUCHERGEBNIS:') || newContent.includes('ANTRAG:')) && 
      (!value || 
       (!value.includes('SUCHERGEBNIS:') && !value.includes('ANTRAG:')) ||
       (newContent.includes('ANTRAG:') && !value.includes('ANTRAG:')))
    );
  };

  // Funktion zum Umschalten des Bearbeitungsmodus
  const handleToggleEditMode = () => {
    console.log('[useContentManagement] Toggle Edit Mode aufgerufen');
    toggleEditMode();
  };

  // Funktion zum Abrufen des exportierbaren Inhalts
  const getExportableContent = (generatedContent) => {
    if (generatedContent) {
      return typeof generatedContent === 'string' 
        ? generatedContent 
        : generatedContent?.content || '';
    }
    return value || '';
  };

  return {
    value,
    updateValue,
    isEditing,
    updateWithGeneratedContent,
    handleToggleEditMode,
    getExportableContent,
    welcomeMessage
  };
};

export default useContentManagement; 