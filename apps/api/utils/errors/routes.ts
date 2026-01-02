/**
 * Express Route Error Handlers
 * HTTP-specific error handling for Express routes
 */

import type { Request, Response, NextFunction } from 'express';
import type { ErrorClassification, RequestWithCorrelation, AIWorkerErrorResult } from './types.js';
import { sendErrorResponse } from '../request/index.js';
import { ERROR_TYPES } from './constants.js';
import {
  VectorBackendError,
  ValidationError,
  AIWorkerError,
  DatabaseError,
  SearchError,
  EmbeddingError,
  CacheError,
  TimeoutError,
  ResourceError,
  isVectorBackendError
} from './classes.js';

/**
 * Classify error and determine HTTP status code
 * Recognizes both custom error classes and generic errors
 */
export function classifyError(error: Error | VectorBackendError): ErrorClassification {
  // Handle custom error classes first
  if (isVectorBackendError(error)) {
    if (error instanceof ValidationError) {
      return { type: 'VALIDATION_ERROR', statusCode: 400 };
    }
    if (error instanceof AIWorkerError) {
      return { type: 'AI_WORKER_ERROR', statusCode: 503 };
    }
    if (error instanceof DatabaseError) {
      return { type: 'DATABASE_ERROR', statusCode: 500 };
    }
    if (error instanceof SearchError) {
      return { type: 'SEARCH_ERROR', statusCode: 500 };
    }
    if (error instanceof EmbeddingError) {
      return { type: 'EMBEDDING_ERROR', statusCode: 500 };
    }
    if (error instanceof CacheError) {
      return { type: 'CACHE_ERROR', statusCode: 500 };
    }
    if (error instanceof TimeoutError) {
      return { type: 'TIMEOUT_ERROR', statusCode: 503 };
    }
    if (error instanceof ResourceError) {
      return { type: 'RESOURCE_ERROR', statusCode: 503 };
    }
    // Generic VectorBackendError
    return { type: error.code, statusCode: 500 };
  }

  // Fallback to message-based classification for generic errors
  const message = error.message?.toLowerCase() || '';

  // Validation errors
  if (message.includes('validation') || message.includes('invalid') ||
      message.includes('required') || message.includes('missing')) {
    return { type: 'VALIDATION_ERROR', statusCode: 400 };
  }

  // Attachment errors
  if (message.includes('attachment') || message.includes('file') ||
      message.includes('upload') || message.includes('size')) {
    return { type: 'ATTACHMENT_ERROR', statusCode: 400 };
  }

  // AI Worker errors
  if (message.includes('ai worker') || message.includes('claude api') ||
      message.includes('openai') || message.includes('anthropic')) {
    return { type: 'AI_WORKER_ERROR', statusCode: 503 };
  }

  // Authentication errors
  if (message.includes('unauthorized') || message.includes('authentication') ||
      (error as any).status === 401) {
    return { type: 'AUTHENTICATION_ERROR', statusCode: 401 };
  }

  // Authorization errors
  if (message.includes('forbidden') || message.includes('authorization') ||
      (error as any).status === 403) {
    return { type: 'AUTHORIZATION_ERROR', statusCode: 403 };
  }

  // Network errors
  if (message.includes('network') || message.includes('connection') ||
      message.includes('enotfound') || message.includes('timeout')) {
    return { type: 'NETWORK_ERROR', statusCode: 503 };
  }

  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many') ||
      (error as any).status === 429) {
    return { type: 'RATE_LIMIT_ERROR', statusCode: 429 };
  }

  // Default to internal error
  return { type: 'INTERNAL_ERROR', statusCode: 500 };
}

/**
 * Handle route errors with secure responses and detailed logging
 */
export function handleRouteError(
  error: Error | VectorBackendError,
  routePath: string,
  res: Response,
  req: Request | null = null
): void {
  // Classify the error
  const { type, statusCode } = classifyError(error);
  const userMessage = ERROR_TYPES[type];

  // Add request context for detailed logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  const userId = (req as any)?.user?.id || 'unknown';
  const requestId = (req as RequestWithCorrelation)?.correlationId || (req as any)?.sessionID || 'unknown';

  // Enhanced logging with context
  console.error(`[${routeName}] Error Details:`, {
    errorType: type,
    userId,
    requestId,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
    timestamp: new Date().toISOString()
  });

  // Send secure response
  sendErrorResponse(res, routePath, error, userMessage, statusCode);
}

/**
 * Handle validation errors specifically
 */
export function handleValidationError(res: Response, routePath: string, message: string): void {
  const error = new ValidationError(`Validation failed: ${message}`);
  handleRouteError(error, routePath, res);
}

/**
 * Handle attachment errors specifically
 */
export function handleAttachmentError(res: Response, routePath: string, message: string): void {
  const error = new Error(`Attachment error: ${message}`);
  handleRouteError(error, routePath, res);
}

/**
 * Handle AI Worker errors specifically
 */
export function handleAIWorkerError(res: Response, routePath: string, aiResult: AIWorkerErrorResult): void {
  const error = new AIWorkerError(`AI Worker failed: ${aiResult.error || 'Unknown AI error'}`);
  handleRouteError(error, routePath, res);
}

/**
 * Wrap async route handlers with consistent error handling
 */
export function withErrorHandler(
  handler: (req: Request, res: Response, next?: NextFunction) => Promise<void>,
  routePath: string
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleRouteError(error as Error, routePath, res, req);
    }
  };
}

/**
 * Middleware to add correlation IDs to requests for better error tracking
 */
export function addCorrelationId(req: Request, res: Response, next: NextFunction): void {
  const extendedReq = req as RequestWithCorrelation;
  extendedReq.correlationId = req.headers['x-correlation-id'] as string ||
                              (req as any).sessionID ||
                              `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  next();
}
