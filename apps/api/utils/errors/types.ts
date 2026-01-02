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
  field?: string;
  value?: any;
  searchType?: string;
  userId?: string;
  embeddingDimensions?: number;
  provider?: string;
  operation?: string;
  table?: string;
  rpcFunction?: string;
  model?: string;
  requestType?: string;
  cacheType?: string;
  timeoutMs?: number;
  resource?: string;
  originalError?: string;
  [key: string]: any;
}

/**
 * API error response format
 */
export interface APIErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  timestamp: string;
  field?: string;
  message?: string;
  details?: ErrorDetails;
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
  stack?: string;
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
  serviceName?: string;
  enableTelemetry?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Error handling context
 */
export interface ErrorContext {
  field?: string;
  value?: any;
  searchType?: string;
  userId?: string;
  provider?: string;
  model?: string;
  operation?: string;
  rpcFunction?: string;
  timeout?: number;
  cacheType?: string;
  embeddingDimensions?: number;
  returnResponse?: boolean;
  [key: string]: any;
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
  correlationId?: string;
}

/**
 * AI worker error result
 */
export interface AIWorkerErrorResult {
  success: false;
  error: string;
  [key: string]: any;
}
