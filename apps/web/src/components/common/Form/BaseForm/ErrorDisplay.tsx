import React from 'react';
import { HiX } from 'react-icons/hi';

import type { ErrorDisplayProps } from '@/types/baseform';

const ERROR_MESSAGES: Record<string, string> = {
  '400':
    'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
  '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
  '403':
    'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
  '404':
    'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
  '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
  '429':
    'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
  '500':
    'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
  '529':
    'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.',
};

const getErrorMessage = (error: string | null | undefined): string => {
  if (!error) return '';

  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (error.includes(code)) {
      return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
    }
  }

  return 'Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.';
};

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onDismiss }) => {
  if (!error) return null;

  const errorMessage = getErrorMessage(error);

  return (
    <div role="alert" aria-live="assertive" className="form-error-message">
      <span className="error-message-text">{errorMessage}</span>
      {onDismiss && (
        <button
          type="button"
          className="error-dismiss-button"
          onClick={onDismiss}
          aria-label="Fehlermeldung schließen"
          title="Fehlermeldung schließen"
        >
          <HiX size="18" />
        </button>
      )}
    </div>
  );
};

ErrorDisplay.displayName = 'ErrorDisplay';

export default ErrorDisplay;
