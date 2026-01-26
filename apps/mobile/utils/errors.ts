/**
 * Error Handling Utilities
 * Standardized error types and utilities for the mobile app
 */

/**
 * Custom API error with additional context
 */
export class ApiError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.isNetworkError = options?.code === 'NETWORK_ERROR' || !options?.statusCode;
    this.isAuthError = options?.statusCode === 401 || options?.statusCode === 403;

    if (options?.cause instanceof Error) {
      this.cause = options.cause;
    }
  }
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if error is a standard Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Extract error message from unknown error
 * Use in catch blocks: catch (error: unknown) { getErrorMessage(error) }
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message || 'API-Fehler';
  }

  if (isError(error)) {
    return error.message || 'Fehler';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    if ('message' in error && error.message) {
      return String(error.message);
    }
    if ('error' in error && error.error) {
      return String(error.error);
    }
  }

  return 'Ein unbekannter Fehler ist aufgetreten';
}

/**
 * Create an ApiError from a fetch Response
 */
export async function createApiErrorFromResponse(
  response: Response,
  fallbackMessage?: string
): Promise<ApiError> {
  let message = fallbackMessage || `Request failed with status ${response.status}`;

  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      if (data.message) message = data.message;
      if (data.error) message = data.error;
    } else {
      const text = await response.text();
      if (text) message = text;
    }
  } catch {
    // Use fallback message if parsing fails
  }

  return new ApiError(message, {
    statusCode: response.status,
    code: response.status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
  });
}

/**
 * Wrap an async function with standardized error handling
 * Returns [result, error] tuple for easy destructuring
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error: unknown) {
    return [null, isError(error) ? error : new Error(getErrorMessage(error))];
  }
}

/**
 * German error messages for common scenarios
 */
export const ErrorMessages = {
  NETWORK: 'Keine Internetverbindung. Bitte überprüfe deine Verbindung.',
  AUTH_EXPIRED: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  AUTH_REQUIRED: 'Bitte melde dich an, um fortzufahren.',
  SERVER: 'Der Server ist momentan nicht erreichbar. Bitte versuche es später erneut.',
  UNKNOWN: 'Ein unbekannter Fehler ist aufgetreten.',
  UPLOAD_FAILED: 'Der Upload ist fehlgeschlagen. Bitte versuche es erneut.',
  DOWNLOAD_FAILED: 'Der Download ist fehlgeschlagen. Bitte versuche es erneut.',
  PERMISSION_DENIED: 'Zugriff verweigert. Bitte überprüfe die Berechtigungen.',
} as const;

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.isNetworkError) return ErrorMessages.NETWORK;
    if (error.isAuthError) return ErrorMessages.AUTH_EXPIRED;
    if (error.statusCode && error.statusCode >= 500) return ErrorMessages.SERVER;
    return error.message;
  }

  if (isError(error)) {
    const rawMsg = error.message;
    const msg = typeof rawMsg === 'string' ? rawMsg.toLowerCase() : '';
    if (msg.includes('network') || msg.includes('fetch')) {
      return ErrorMessages.NETWORK;
    }
    return typeof rawMsg === 'string' ? rawMsg : ErrorMessages.UNKNOWN;
  }

  return ErrorMessages.UNKNOWN;
}
