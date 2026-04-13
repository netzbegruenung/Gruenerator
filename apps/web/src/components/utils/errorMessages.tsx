const errorMessages = {
  // HTTP Status Code Errors
  400: {
    title: 'Ungültige Anfrage',
    message:
      'Die Anfrage konnte nicht verarbeitet werden. Bitte überprüfen Sie Ihre Eingaben und versuchen Sie es erneut.',
  },
  401: {
    title: 'Authentifizierungsfehler',
    message:
      'Es gibt ein Problem mit der API-Authentifizierung. Bitte versuchen Sie es später erneut.',
  },
  403: {
    title: 'Zugriff verweigert',
    message: 'Keine Berechtigung für diese Aktion. Bitte versuchen Sie es später erneut.',
  },
  404: {
    title: 'Nicht gefunden',
    message:
      'Die angeforderte Ressource konnte nicht gefunden werden. Bitte versuchen Sie es später erneut.',
  },
  413: {
    title: 'Anfrage zu groß',
    message:
      'Ihre Eingabe ist zu umfangreich. Bitte kürzen Sie Ihren Text und versuchen Sie es erneut.',
  },
  429: {
    title: 'Anfragelimit erreicht',
    message:
      'Es wurden zu viele Anfragen gestellt. Bitte warten Sie einen Moment und versuchen Sie es dann erneut.',
  },
  500: {
    title: 'KI-Dienst nicht verfügbar',
    message:
      'Ein unerwarteter Fehler ist in der KI aufgetreten. Bitte versuchen Sie es später erneut.',
  },
  529: {
    title: 'System überlastet',
    message:
      'Der KI-Dienst ist derzeit überlastet. Bitte versuchen Sie es in einigen Minuten erneut.',
  },

  // Axios Error Codes
  ERR_NETWORK: {
    title: 'Netzwerkfehler',
    message: 'Keine Verbindung zum Server möglich. Bitte überprüfen Sie Ihre Internetverbindung.',
  },
  ERR_BAD_REQUEST: {
    title: 'Fehlerhafte Anfrage',
    message: 'Die Anfrage konnte nicht verarbeitet werden. Bitte überprüfen Sie Ihre Eingaben.',
  },
  ERR_BAD_RESPONSE: {
    title: 'Ungültige Serverantwort',
    message:
      'Der Server hat eine ungültige Antwort gesendet. Bitte versuchen Sie es später erneut.',
  },
  ERR_TIMEOUT: {
    title: 'Zeitüberschreitung',
    message: 'Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es später erneut.',
  },

  // Default
  default: {
    title: 'Unerwarteter Fehler',
    message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
  },

  // Network error direkt in die Hauptfehlermeldungen aufnehmen
  network_error: {
    title: 'Verbindungsfehler',
    message:
      'Die Verbindung zum Server konnte nicht hergestellt werden. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
  },
};

interface ApiErrorObject {
  isAxiosError?: boolean;
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, string>;
  };
  code?: string;
  error?: { type?: string; message?: string };
  message?: string;
  headers?: Record<string, string>;
}

const getErrorMessage = (error: ApiErrorObject | string | unknown) => {
  // Erweiterte Fehlertyp-Extraktion
  let errorType: string | number;

  // Prüfe zuerst auf Axios-Fehler
  if (typeof error === 'string') {
    return {
      title: 'Fehler',
      message: error,
    };
  }

  const err = error as ApiErrorObject;

  if (err?.isAxiosError) {
    errorType = err.response?.status ?? err.code ?? 'network_error';
  } else if (err?.error?.type) {
    // Anthropic API Fehler
    errorType = err.error.type;
  } else {
    errorType = 'default';
  }

  // Direkt errorMessages verwenden, keine Kopie mehr nötig
  const errorInfo = errorMessages[errorType as keyof typeof errorMessages] ?? errorMessages.default;

  console.log('[getErrorMessage] Fehlertyp:', errorType); // Logging hinzufügen
  console.log('[getErrorMessage] Fehlerinfo:', errorInfo); // Logging hinzufügen

  return {
    title: errorInfo.title,
    message: errorInfo.message,
    details: err?.response?.data ?? err?.error?.message ?? err?.message,
    requestId: err?.headers?.['request-id'] ?? err?.response?.headers?.['request-id'],
    status: err?.response?.status,
  };
};

interface ErrorDisplayProps {
  error: {
    title?: string;
    message: string;
    details?: string;
    requestId?: string;
    status?: number;
  };
  className?: string;
}

const ErrorDisplay = ({ error, className = '' }: ErrorDisplayProps): JSX.Element => {
  console.log('[ErrorDisplay] Rendering with error:', error); // Debug-Log

  if (!error) {
    console.log('[ErrorDisplay] No error provided');
    return null;
  }

  // Sicherstellen, dass wir die richtigen Eigenschaften haben
  const errorTitle = error.title || 'Unerwarteter Fehler';
  const errorMessage = error.message || 'Ein unbekannter Fehler ist aufgetreten';

  return (
    <div className={`error-display ${className}`} role="alert">
      <h4>{errorTitle}</h4>
      <p>{errorMessage}</p>
      {(error.details || error.status || error.requestId) && (
        <details>
          <summary>Technische Details</summary>
          {error.details && <p>Details: {error.details}</p>}
          {error.status && <p>Status: {error.status}</p>}
          {error.requestId && <p>Request ID: {error.requestId}</p>}
        </details>
      )}
    </div>
  );
};
