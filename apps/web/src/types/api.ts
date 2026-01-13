/**
 * API Error Types and Response Handling
 */

// Error classes
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class NetworkError extends ApiError {
  name = 'NetworkError' as const;

  constructor(message: string, code?: string) {
    super(message, code);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ValidationError extends ApiError {
  name = 'ValidationError' as const;

  constructor(message: string, code?: string) {
    super(message, code);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ServerError extends ApiError {
  name = 'ServerError' as const;

  constructor(message: string, code?: string, status?: number) {
    super(message, code, status);
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

export class UnauthorizedError extends ApiError {
  name = 'UnauthorizedError' as const;

  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, code, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class NotFoundError extends ApiError {
  name = 'NotFoundError' as const;

  constructor(message: string = 'Not found', code?: string) {
    super(message, code, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Alternative API response format (use ApiResponse from auth.ts for the main format)
 * This is a more discriminated union type useful for detailed error handling
 */
export type StrictApiResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

/**
 * Normalize any error into an ApiError instance
 * @param error Unknown error value
 * @returns Properly typed ApiError instance
 */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ServerError(error.message);
  }

  if (typeof error === 'string') {
    return new ServerError(error);
  }

  return new ServerError('Unknown error occurred');
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a ServerError
 */
export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

/**
 * Type guard to check if error is an UnauthorizedError
 */
export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}

/**
 * Type guard to check if error is a NotFoundError
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}
