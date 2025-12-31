import { useState, useCallback } from 'react';
import useBaseForm from './useBaseForm';

/**
 * Hook für die Fehlerbehandlung in Formularen
 * @deprecated Use useBaseForm instead for new implementations
 * @returns {Object} Fehlerzustand und Funktionen
 */
const useErrorHandling = () => {
  const [error, setError] = useState('');
  
  // For new implementations, recommend using useBaseForm

  /**
   * Generiert eine benutzerfreundliche Fehlermeldung basierend auf dem Fehlercode
   * @param {string} error - Fehlertext oder Code
   * @returns {string} Benutzerfreundliche Fehlermeldung
   */
  const getErrorMessage = useCallback((error) => {
    if (!error) return '';
    
    const errorMessages = {
      '400': 'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403': 'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404': 'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429': 'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
      '500': 'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
      '529': 'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.'
    };

    for (const [code, message] of Object.entries(errorMessages)) {
      if (error.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }

    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  }, []);

  /**
   * Behandelt Fehler bei der Formularübermittlung
   * @param {Error} error - Fehlerobjekt
   */
  const handleSubmitError = useCallback((error) => {
    console.error('[useErrorHandling] Submit error:', error);
    if (error?.response?.status) {
      setError(`${error.response.status}`);
    } else if (error?.message) {
      setError(error.message);
    } else {
      setError('Ein unbekannter Fehler ist aufgetreten.');
    }
  }, []);

  /**
   * Setzt den Fehlerzustand zurück
   */
  const clearError = useCallback(() => {
    setError('');
  }, []);

  return {
    error,
    setError,
    getErrorMessage,
    handleSubmitError,
    clearError
  };
};

export default useErrorHandling; 