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
    toggleEditMode
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

    // Wenn value leer ist, setze generatedContent
    if (!value) {
      console.log('[useContentManagement] Setze generatedContent in value:', generatedContent);
      updateValue(generatedContent);
      return;
    }
    
    // Wenn generatedContent SUCHERGEBNIS oder ANTRAG enthält, aktualisiere auch value
    if (generatedContent && 
        (generatedContent.includes('SUCHERGEBNIS:') || generatedContent.includes('ANTRAG:')) && 
        (!value || 
         (!value.includes('SUCHERGEBNIS:') && !value.includes('ANTRAG:')) ||
         (generatedContent.includes('ANTRAG:') && !value.includes('ANTRAG:')))) {
      console.log('[useContentManagement] Aktualisiere value mit generatedContent, da SUCHERGEBNIS oder ANTRAG enthalten ist');
      updateValue(generatedContent);
    }
  };

  // Funktion zum Umschalten des Bearbeitungsmodus
  const handleToggleEditMode = () => {
    console.log('[useContentManagement] Toggle Edit Mode aufgerufen');
    toggleEditMode();
  };

  // Funktion zum Abrufen des exportierbaren Inhalts
  const getExportableContent = (generatedContent) => {
    if (generatedContent) {
      return typeof generatedContent === 'string' ? generatedContent : generatedContent?.content || '';
    }
    return value || '';
  };

  return {
    value,
    updateValue,
    isEditing,
    updateWithGeneratedContent,
    handleToggleEditMode,
    getExportableContent
  };
};

export default useContentManagement; 