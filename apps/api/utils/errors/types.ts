/**
 * Error Types and Interfaces
 * Comprehensive type definitions for error handling system
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Error codes for classification
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'ATTACHMENT_ERROR'
  | 'AI_WORKER_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SEARCH_ERROR'
  | 'EMBEDDING_ERROR'
  | 'DATABASE_ERROR'
  | 'CACHE_ERROR'
  | 'RESOURCE_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN_ERROR';

/**
 * HTTP status codes
 */
export type StatusCode = 400 | 401 | 403 | 404 | 429 | 500 | 503;

/**
 * Error classification result
 */
export interface ErrorClassification {
  type: ErrorCode;
  statusCode: StatusCode;
}

/**
 * Error details metadata
 */
export interface ErrorDetails {
  field?: string | undefined;
  value?: unknown | undefined;
  searchType?: string | undefined;
  userId?: string | undefined;
  embeddingDimensions?: number | undefined;
  provider?: string | undefined;
  operation?: string | undefined;
  table?: string | undefined;
  rpcFunction?: string | undefined;
  model?: string | undefined;
  requestType?: string | undefined;
  cacheType?: string | undefined;
  timeoutMs?: number | undefined;
  resource?: string | undefined;
  originalError?: string | undefined;
  [key: string]: unknown;
}

/**
 * API error response format
 */
export interface APIErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  timestamp: string;
  field?: string | undefined;
  message?: string | undefined;
  details?: ErrorDetails | undefined;
}

/**
 * Structured log entry
 */
export interface ErrorLogEntry {
  name: string;
  message: string;
  code: ErrorCode;
  details: ErrorDetails;
  timestamp: string;
  stack?: string | undefined;
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
  serviceName?: string | undefined;
  enableTelemetry?: boolean | undefined;
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | undefined;
}

/**
 * Error handling context
 */
export interface ErrorContext {
  field?: string | undefined;
  value?: unknown | undefined;
  searchType?: string | undefined;
  userId?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  operation?: string | undefined;
  rpcFunction?: string | undefined;
  timeout?: number | undefined;
  cacheType?: string | undefined;
  embeddingDimensions?: number | undefined;
  returnResponse?: boolean | undefined;
  [key: string]: unknown;
}

/**
 * Express error handler function type
 */
export type ExpressErrorHandler = (
  handler: (req: Request, res: Response, next?: NextFunction) => Promise<void>,
  routePath: string
) => (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Request with correlation ID
 */
export interface RequestWithCorrelation extends Request {
  correlationId?: string | undefined;
}

/**
 * AI worker error result
 */
export interface AIWorkerErrorResult {
  success: false;
  error: string;
  [key: string]: unknown;
}
