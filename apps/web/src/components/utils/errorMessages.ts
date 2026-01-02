import type { AxiosError } from 'axios';

/**
 * Error message structure returned by getErrorMessage
 */
export interface ErrorMessageInfo {
  title: string;
  message: string;
  details?: string;
}

/**
 * Anthropic API error structure
 */
interface AnthropicError {
  error?: {
    type: string;
    message?: string;
  };
}

/**
 * Application error with code
 */
interface AppError {
  code?: string;
  message?: string;
}

/**
 * Union type for all possible error inputs
 */
type ErrorInput = AxiosError | AnthropicError | AppError | string | unknown;

/**
 * HTTP status codes and error codes mapped to messages
 */
type ErrorCode = number | string;

const errorMessages: Record<ErrorCode, ErrorMessageInfo> = {
  // HTTP Status Codes
  400: {
    title: 'Ungültige Anfrage',
    message: 'Die Anfrage konnte nicht verarbeitet werden. Bitte überprüfen Sie Ihre Eingaben und versuchen Sie es erneut.'
  },
  401: {
    title: 'Authentifizierungsfehler',
    message: 'Es gibt ein Problem mit der API-Authentifizierung. Bitte versuchen Sie es später erneut.'
  },
  403: {
    title: 'Zugriff verweigert',
    message: 'Keine Berechtigung für diese Aktion. Bitte versuchen Sie es später erneut.'
  },
  404: {
    title: 'Nicht gefunden',
    message: 'Die angeforderte Ressource konnte nicht gefunden werden. Bitte versuchen Sie es später erneut.'
  },
  413: {
    title: 'Anfrage zu groß',
    message: 'Ihre Eingabe ist zu umfangreich. Bitte kürzen Sie Ihren Text und versuchen Sie es erneut.'
  },
  429: {
    title: 'Anfragelimit erreicht',
    message: 'Es wurden zu viele Anfragen gestellt. Bitte warten Sie einen Moment und versuchen Sie es dann erneut.'
  },
  500: {
    title: 'KI-Dienst nicht verfügbar',
    message: 'Ein unerwarteter Fehler ist in der KI aufgetreten. Bitte versuchen Sie es später erneut.'
  },
  502: {
    title: 'Server nicht erreichbar',
    message: 'Der Server ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.'
  },
  503: {
    title: 'Service nicht verfügbar',
    message: 'Der Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.'
  },
  504: {
    title: 'Gateway Timeout',
    message: 'Der Server reagiert nicht. Bitte versuchen Sie es später erneut.'
  },
  529: {
    title: 'System überlastet',
    message: 'Der KI-Dienst ist derzeit überlastet. Bitte versuchen Sie es in einigen Minuten erneut.'
  },

  // Axios Error Codes
  ERR_NETWORK: {
    title: 'Netzwerkfehler',
    message: 'Keine Verbindung zum Server möglich. Bitte überprüfen Sie Ihre Internetverbindung.'
  },
  ERR_BAD_REQUEST: {
    title: 'Fehlerhafte Anfrage',
    message: 'Die Anfrage konnte nicht verarbeitet werden. Bitte überprüfen Sie Ihre Eingaben.'
  },
  ERR_BAD_RESPONSE: {
    title: 'Ungültige Serverantwort',
    message: 'Der Server hat eine ungültige Antwort gesendet. Bitte versuchen Sie es später erneut.'
  },
  ERR_TIMEOUT: {
    title: 'Zeitüberschreitung',
    message: 'Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es später erneut.'
  },

  // Fallback
  default: {
    title: 'Unerwarteter Fehler',
    message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
  }
};

/**
 * Type guard to check if error is AxiosError
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (error as AxiosError)?.isAxiosError === true;
}

/**
 * Type guard to check if error is AnthropicError
 */
function isAnthropicError(error: unknown): error is AnthropicError {
  return (error as AnthropicError)?.error?.type !== undefined;
}

/**
 * Type guard to check if error has code property
 */
function hasCode(error: unknown): error is AppError {
  return (error as AppError)?.code !== undefined;
}

/**
 * Get a user-friendly error message from various error types
 */
export const getErrorMessage = (error: ErrorInput): ErrorMessageInfo => {
  // Check for specific error messages
  if (typeof error === 'string' && error.includes('Something broke!')) {
    return {
      title: 'Serverfehler',
      message: 'Ein unerwarteter Fehler ist auf dem Server aufgetreten. Bitte versuchen Sie es später erneut.',
      details: 'Backend-Fehler: Something broke!'
    };
  }

  // Determine error type
  let errorType: ErrorCode;

  if (isAxiosError(error)) {
    errorType = error.response?.status || error.code || 'ERR_NETWORK';
  } else if (isAnthropicError(error)) {
    errorType = error.error?.type || 'default';
  } else if (hasCode(error)) {
    errorType = error.code || 'default';
  } else if (typeof error === 'string') {
    return {
      title: 'Fehler',
      message: error,
      details: error
    };
  } else {
    errorType = 'default';
  }

  return errorMessages[errorType] || errorMessages.default;
};
