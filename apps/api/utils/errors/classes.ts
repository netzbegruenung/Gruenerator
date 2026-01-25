/**
 * Error Classes
 * Structured error classes with inheritance hierarchy
 */

import type { ErrorCode, ErrorDetails, APIErrorResponse, ErrorLogEntry } from './types.js';

/**
 * Base error class for all backend errors
 * All custom error classes extend this base
 */
export class VectorBackendError extends Error {
  public readonly code: ErrorCode;
  public readonly details: ErrorDetails;
  public readonly timestamp: string;
  public readonly isVectorBackendError: true = true;

  constructor(message: string, code: ErrorCode, details: ErrorDetails = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to safe API response
   */
  toAPIResponse(): APIErrorResponse {
    return {
      success: false,
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
      // Don't expose internal details in production
      ...(process.env.NODE_ENV !== 'production' && { details: this.details }),
    };
  }

  /**
   * Convert error to log format
   */
  toLogEntry(): ErrorLogEntry {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Validation error - input parameters are invalid
 */
export class ValidationError extends VectorBackendError {
  public readonly field?: string;
  public readonly value?: any;

  constructor(message: string, field?: string, value?: any, code: ErrorCode = 'VALIDATION_ERROR') {
    super(message, code, { field, value });
    this.field = field;
    this.value = value;
  }

  override toAPIResponse(): APIErrorResponse {
    return {
      ...super.toAPIResponse(),
      field: this.field,
      message: 'Validation error',
    };
  }
}

/**
 * Search error - issues during search operations
 */
export class SearchError extends VectorBackendError {
  public readonly searchType: string;
  public readonly userId?: string;

  constructor(message: string, code: ErrorCode = 'SEARCH_ERROR', details: ErrorDetails = {}) {
    super(message, code, details);
    this.searchType = details.searchType || 'unknown';
    this.userId = details.userId;
  }
}

/**
 * Embedding error - issues with embedding generation or validation
 */
export class EmbeddingError extends VectorBackendError {
  public readonly embeddingDimensions?: number;
  public readonly provider?: string;

  constructor(message: string, code: ErrorCode = 'EMBEDDING_ERROR', details: ErrorDetails = {}) {
    super(message, code, details);
    this.embeddingDimensions = details.embeddingDimensions;
    this.provider = details.provider;
  }
}

/**
 * Database error - issues with database operations
 */
export class DatabaseError extends VectorBackendError {
  public readonly operation?: string;
  public readonly table?: string;
  public readonly rpcFunction?: string;

  constructor(message: string, code: ErrorCode = 'DATABASE_ERROR', details: ErrorDetails = {}) {
    super(message, code, details);
    this.operation = details.operation;
    this.table = details.table;
    this.rpcFunction = details.rpcFunction;
  }
}

/**
 * AI worker error - issues with AI service calls
 */
export class AIWorkerError extends VectorBackendError {
  public readonly provider?: string;
  public readonly model?: string;
  public readonly requestType?: string;

  constructor(message: string, code: ErrorCode = 'AI_WORKER_ERROR', details: ErrorDetails = {}) {
    super(message, code, details);
    this.provider = details.provider;
    this.model = details.model;
    this.requestType = details.requestType;
  }
}

/**
 * Cache error - issues with caching operations
 */
export class CacheError extends VectorBackendError {
  public readonly cacheType?: string;
  public readonly operation?: string;

  constructor(message: string, code: ErrorCode = 'CACHE_ERROR', details: ErrorDetails = {}) {
    super(message, code, details);
    this.cacheType = details.cacheType;
    this.operation = details.operation;
  }
}

/**
 * Timeout error - operations exceeded time limits
 */
export class TimeoutError extends VectorBackendError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, code: ErrorCode = 'TIMEOUT_ERROR') {
    super(message, code, { timeoutMs });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Resource exhaustion error - system resources exceeded
 */
export class ResourceError extends VectorBackendError {
  public readonly resource: string;

  constructor(message: string, resource: string, code: ErrorCode = 'RESOURCE_ERROR') {
    super(message, code, { resource });
    this.resource = resource;
  }
}

/**
 * Type guard to check if error is a VectorBackendError
 */
export function isVectorBackendError(error: any): error is VectorBackendError {
  return error && error.isVectorBackendError === true;
}
