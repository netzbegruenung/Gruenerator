import React from 'react';
import PropTypes from 'prop-types';

// Inline error message function (moved from deleted errorUtils)
const getErrorMessage = (error) => {
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
};

/**
 * Komponente zur Anzeige von Fehlermeldungen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.error - Fehlertext oder Code
 * @returns {JSX.Element|null} Fehlermeldung oder null
 */
const ErrorDisplay = ({ error }) => {
  if (!error) return null;

  const errorMessage = getErrorMessage(error);

  return (
    <p role="alert" aria-live="assertive" className="form-error-message">
      {errorMessage}
    </p>
  );
};

ErrorDisplay.propTypes = {
  error: PropTypes.string
};

export default ErrorDisplay; 