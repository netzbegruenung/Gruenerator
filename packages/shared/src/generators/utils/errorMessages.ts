/**
 * Error Messages
 * Maps API errors to user-friendly German error messages.
 */

import type { GeneratorError } from '../types';

// Type guard for axios errors
interface AxiosErrorLike {
  response?: {
    status?: number;
    data?: {
      error?: string;
      message?: string;
    };
  };
  message?: string;
  code?: string;
}

function isAxiosError(error: unknown): error is AxiosErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('response' in error || 'code' in error)
  );
}

/**
 * Parses an error into a user-friendly GeneratorError.
 *
 * Maps HTTP status codes and axios errors to German messages:
 * - 401 → "Nicht angemeldet. Bitte erneut einloggen."
 * - 403 → "Keine Berechtigung für diese Aktion."
 * - 429 → "Zu viele Anfragen. Bitte kurz warten."
 * - 500 → "Serverfehler. Bitte später erneut versuchen."
 * - Network → "Keine Verbindung zum Server."
 *
 * @param error - The caught error (axios error, Error, or unknown)
 * @returns GeneratorError with message, code, and retryable flag
 */
export function parseGeneratorError(error: unknown): GeneratorError {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const serverMessage =
      error.response?.data?.error ||
      error.response?.data?.message;

    // Server-provided message takes priority
    if (serverMessage && typeof serverMessage === 'string') {
      return {
        message: serverMessage,
        code: String(status ?? 'UNKNOWN'),
        isRetryable: status === 503 || status === 529 || status === 429,
      };
    }

    // Map status codes to user-friendly messages
    switch (status) {
      case 401:
        return {
          message: 'Nicht angemeldet. Bitte erneut einloggen.',
          code: '401',
          isRetryable: false,
        };
      case 403:
        return {
          message: 'Keine Berechtigung für diese Aktion.',
          code: '403',
          isRetryable: false,
        };
      case 429:
        return {
          message: 'Zu viele Anfragen. Bitte kurz warten.',
          code: '429',
          isRetryable: true,
        };
      case 500:
        return {
          message: 'Serverfehler. Bitte später erneut versuchen.',
          code: '500',
          isRetryable: true,
        };
      case 502:
      case 503:
      case 504:
        return {
          message: 'Service vorübergehend nicht verfügbar. Bitte kurz warten.',
          code: String(status),
          isRetryable: true,
        };
      case 529:
        return {
          message: 'Service überlastet. Bitte kurz warten.',
          code: '529',
          isRetryable: true,
        };
      default:
        if (status && status >= 400 && status < 500) {
          return {
            message: `Fehler bei der Anfrage (${status})`,
            code: String(status),
            isRetryable: false,
          };
        }
        if (status && status >= 500) {
          return {
            message: `Serverfehler (${status}). Bitte später erneut versuchen.`,
            code: String(status),
            isRetryable: true,
          };
        }
    }

    // Network error (no response received)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return {
          message: 'Zeitüberschreitung. Bitte erneut versuchen.',
          code: 'TIMEOUT',
          isRetryable: true,
        };
      }
      return {
        message: 'Keine Verbindung zum Server.',
        code: 'NETWORK',
        isRetryable: true,
      };
    }
  }

  // Standard Error object
  if (error instanceof Error) {
    return {
      message: error.message || 'Unbekannter Fehler bei der Generierung',
      code: 'ERROR',
      isRetryable: false,
    };
  }

  // Unknown error type
  return {
    message: 'Unbekannter Fehler bei der Generierung',
    code: 'UNKNOWN',
    isRetryable: false,
  };
}

/**
 * Creates a simple error message string from an error.
 * Convenience function for cases where only the message is needed.
 *
 * @param error - The caught error
 * @returns User-friendly error message string
 */
export function getErrorMessage(error: unknown): string {
  return parseGeneratorError(error).message;
}
