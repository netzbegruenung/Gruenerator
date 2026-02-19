/**
 * Error Handlers
 * Central error handling with logging and monitoring
 */

import {
  type VectorBackendError,
  ValidationError,
  SearchError,
  EmbeddingError,
  DatabaseError,
  AIWorkerError,
  CacheError,
  TimeoutError,
  ResourceError,
  isVectorBackendError,
} from './classes.js';
import { SENSITIVE_FIELDS, MAX_LOG_STRING_LENGTH } from './constants.js';

import type { ErrorHandlerOptions, ErrorContext, APIErrorResponse } from './types.js';

/**
 * Error handler with logging and monitoring hooks
 */
export class ErrorHandler {
  private readonly serviceName: string;
  private readonly enableTelemetry: boolean;
  private readonly logLevel: 'error' | 'warn' | 'info' | 'debug';

  constructor(options: ErrorHandlerOptions = {}) {
    this.serviceName = options.serviceName || 'VectorBackend';
    this.enableTelemetry = options.enableTelemetry !== false;
    this.logLevel = options.logLevel || 'error';
  }

  /**
   * Handle error with logging and optional monitoring
   */
  handle(error: Error, context: ErrorContext = {}): APIErrorResponse {
    // Convert to VectorBackendError if needed
    const standardizedError = this.standardizeError(error, context);

    // Log the error
    this.logError(standardizedError, context);

    // Send to monitoring (if enabled)
    if (this.enableTelemetry) {
      this.sendToMonitoring(standardizedError, context);
    }

    return standardizedError.toAPIResponse();
  }

  /**
   * Convert any error to VectorBackendError
   */
  standardizeError(error: Error, context: ErrorContext = {}): VectorBackendError {
    if (isVectorBackendError(error)) {
      return error;
    }

    // Detect error type based on message patterns
    const message = error.message || 'Unknown error';

    if (message.includes('timeout') || (error as any).code === 'ETIMEDOUT') {
      return new TimeoutError(message, context.timeout || 0);
    }

    if (message.includes('validation') || error.name === 'ValidationError') {
      return new ValidationError(message, context.field, context.value);
    }

    if (
      message.includes('database') ||
      message.includes('RPC') ||
      (error as any).code === 'PGRST'
    ) {
      return new DatabaseError(message, 'DATABASE_ERROR', {
        operation: context.operation,
        rpcFunction: context.rpcFunction,
      });
    }

    if (message.includes('embedding') || context.operation === 'embedding') {
      return new EmbeddingError(message, 'EMBEDDING_ERROR', {
        provider: context.provider,
        embeddingDimensions: context.embeddingDimensions,
      });
    }

    if (message.includes('AI') || message.includes('worker') || context.operation === 'ai_worker') {
      return new AIWorkerError(message, 'AI_WORKER_ERROR', {
        provider: context.provider,
        model: context.model,
      });
    }

    if (message.includes('cache') || context.operation === 'cache') {
      return new CacheError(message, 'CACHE_ERROR', {
        cacheType: context.cacheType,
      });
    }

    // Default to generic search error
    return new SearchError(message, 'UNKNOWN_ERROR', {
      originalError: error.name,
      searchType: context.searchType,
    });
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: VectorBackendError, context: ErrorContext = {}): void {
    const logEntry = {
      ...error.toLogEntry(),
      service: this.serviceName,
      context: this.sanitizeContext(context),
    };

    // Choose log level based on error type
    if (error instanceof ValidationError) {
      console.warn(`[${this.serviceName}] Validation error:`, logEntry);
    } else if (error instanceof TimeoutError || error instanceof ResourceError) {
      console.error(`[${this.serviceName}] System error:`, logEntry);
    } else {
      console.error(`[${this.serviceName}] Error:`, logEntry);
    }
  }

  /**
   * Send error to monitoring system (placeholder)
   */
  private sendToMonitoring(error: VectorBackendError, context: ErrorContext = {}): void {
    // This would integrate with monitoring systems like:
    // - OpenTelemetry
    // - Datadog
    // - New Relic
    // - Custom telemetry endpoints

    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[${this.serviceName}] Would send to monitoring:`, {
        error: error.toLogEntry(),
        context: this.sanitizeContext(context),
      });
    }
  }

  /**
   * Remove sensitive data from context before logging
   */
  private sanitizeContext(context: ErrorContext): ErrorContext {
    const sanitized: ErrorContext = { ...context };

    // Remove sensitive fields
    SENSITIVE_FIELDS.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Truncate large objects
    Object.keys(sanitized).forEach((key) => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > MAX_LOG_STRING_LENGTH) {
        sanitized[key] = sanitized[key].substring(0, MAX_LOG_STRING_LENGTH - 3) + '...';
      }
    });

    return sanitized;
  }
}

/**
 * Create error handler with service-specific configuration
 */
export function createErrorHandler(
  serviceName: string,
  options: ErrorHandlerOptions = {}
): ErrorHandler {
  return new ErrorHandler({
    serviceName,
    ...options,
  });
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorHandler: ErrorHandler,
  context: ErrorContext = {}
): T {
  return (async (...args: Parameters<T>): Promise<any> => {
    try {
      return await fn(...args);
    } catch (error) {
      const response = errorHandler.handle(error as Error, context);

      // For API responses, return the error response
      // For internal operations, re-throw with standardized error
      if (context.returnResponse) {
        return response;
      } else {
        throw errorHandler.standardizeError(error as Error, context);
      }
    }
  }) as T;
}

/**
 * Safely extract error message from unknown catch variable
 * Use this in catch blocks when useUnknownInCatchVariables is enabled
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

/**
 * Safely get the full error object if it's an Error, otherwise wrap it
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error(getErrorMessage(error));
}
