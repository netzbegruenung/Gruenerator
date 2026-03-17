/* global process */
import { type Dispatch, type SetStateAction, useState, useCallback, useEffect } from 'react';

const ERROR_TIMEOUT = 5000; // 5 Sekunden für automatisches Ausblenden

interface ErrorMessage {
  title: string;
  message: string;
}

interface ProcessedError extends ErrorMessage {
  details?: string;
  code?: string | number;
  timestamp: string;
  requestId?: string;
  status?: number;
  raw?: unknown;
}

interface AxiosError {
  isAxiosError: boolean;
  response?: {
    status: number;
    headers?: Record<string, string>;
  };
  code?: string;
  message?: string;
  details?: string;
  requestId?: string;
}

interface AnthropicError {
  error: {
    type: string;
    message?: string;
  };
}

interface AppError {
  code: string;
  message?: string;
  details?: string;
  requestId?: string;
}

type ErrorInput = AxiosError | AnthropicError | AppError | string | Error;

const errorMessages: Record<string | number, ErrorMessage> = {
  // HTTP Status Codes
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
  502: {
    title: 'Server nicht erreichbar',
    message: 'Der Server ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.',
  },
  503: {
    title: 'Service nicht verfügbar',
    message: 'Der Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
  },
  504: {
    title: 'Gateway Timeout',
    message: 'Der Server reagiert nicht. Bitte versuchen Sie es später erneut.',
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

  // Anwendungsspezifische Fehler
  VALIDATION_ERROR: {
    title: 'Validierungsfehler',
    message: 'Bitte überprüfen Sie Ihre Eingaben auf Fehler.',
  },
  NO_SUGGESTIONS: {
    title: 'Keine Vorschläge',
    message:
      'Es konnten keine Vorschläge generiert werden. Bitte versuchen Sie es mit einer anderen Formulierung.',
  },
  CONTENT_TOO_LONG: {
    title: 'Inhalt zu lang',
    message: 'Der eingegebene Text ist zu lang. Bitte kürzen Sie Ihren Text.',
  },
  INVALID_FORMAT: {
    title: 'Ungültiges Format',
    message: 'Das Format der Eingabe ist ungültig. Bitte überprüfen Sie Ihre Eingabe.',
  },

  // Anthropic API spezifische Fehler
  rate_limit_error: {
    title: 'API-Limit erreicht',
    message: 'Das API-Limit wurde erreicht. Bitte versuchen Sie es später erneut.',
  },
  invalid_api_key: {
    title: 'API-Schlüssel ungültig',
    message:
      'Es liegt ein Problem mit der API-Authentifizierung vor. Bitte kontaktieren Sie den Support.',
  },

  // Fallback für unbekannte Fehler
  default: {
    title: 'Unerwarteter Fehler',
    message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
  },
};

interface UseErrorReturn {
  error: ProcessedError | null;
  setError: Dispatch<SetStateAction<ProcessedError | null>>;
  handleError: (err: ErrorInput) => ProcessedError;
  resetError: () => void;
  updateError: (errorUpdate: Partial<ProcessedError>) => void;
  isError: boolean;
}

const useError = (autoHideTimeout: number = ERROR_TIMEOUT): UseErrorReturn => {
  const [error, setError] = useState<ProcessedError | null>(null);
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup-Funktion für den Timeout
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  const resetError = useCallback((): void => {
    setError(null);
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
  }, [timeoutId]);

  const handleError = useCallback(
    (err: ErrorInput): ProcessedError => {
      console.group('Error Handling');
      console.error('Original error:', err);

      // Fehlertyp und Info ermitteln
      let errorInfo: ErrorMessage | undefined;
      let errorType: string | number | undefined;

      if (typeof err === 'object' && err !== null && 'isAxiosError' in err && err.isAxiosError) {
        // Axios Fehler
        const axiosErr = err as AxiosError;
        errorType = axiosErr.response?.status || axiosErr.code || 'ERR_NETWORK';
      } else if (
        typeof err === 'object' &&
        err !== null &&
        'error' in err &&
        (err as AnthropicError).error?.type
      ) {
        // Anthropic API Fehler
        errorType = (err as AnthropicError).error.type;
      } else if (typeof err === 'object' && err !== null && 'code' in err) {
        // Anwendungsspezifische Fehler
        errorType = (err as AppError).code;
      } else if (typeof err === 'string') {
        // String-Fehler
        errorInfo = {
          title: 'Fehler',
          message: err,
        };
      } else {
        // Fallback
        errorType = 'default';
      }

      // Fehlermeldung aus errorMessages holen, wenn noch nicht gesetzt
      if (!errorInfo) {
        errorInfo = errorMessages[errorType as string | number] || errorMessages.default;
      }

      // Finalen Fehler-Objekt erstellen
      const errObj = err as unknown as Record<string, unknown>;
      const finalError: ProcessedError = {
        ...errorInfo,
        details:
          (errObj?.details as string) ||
          (errObj?.message as string) ||
          ((errObj?.error as Record<string, unknown>)?.message as string),
        code: errorType,
        timestamp: new Date().toISOString(),
        requestId:
          (errObj?.requestId as string) ||
          (errObj?.response as Record<string, Record<string, string>>)?.headers?.['request-id'],
        status: (errObj?.response as Record<string, number>)?.status,
        raw: process.env.NODE_ENV === 'development' ? err : undefined,
      };

      console.log('Processed error:', finalError);
      console.groupEnd();

      // Bestehenden Timeout löschen
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Fehler setzen
      setError(finalError);

      // Neuen Timeout setzen, wenn autoHideTimeout > 0
      if (autoHideTimeout > 0) {
        const newTimeoutId = setTimeout(() => {
          resetError();
        }, autoHideTimeout);
        setTimeoutId(newTimeoutId);
      }

      return finalError;
    },
    [autoHideTimeout, timeoutId, resetError]
  );

  const updateError = useCallback((errorUpdate: Partial<ProcessedError>): void => {
    setError((current) => (current ? { ...current, ...errorUpdate } : null));
  }, []);

  return {
    error,
    setError,
    handleError,
    resetError,
    updateError,
    isError: !!error,
  };
};

export default useError;
