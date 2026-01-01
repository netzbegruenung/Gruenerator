/**
 * Standardized error handling for the vector backend
 * Provides consistent error types, logging, and response formatting
 */

/**
 * Base error class for all vector backend errors
 */
class VectorBackendError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.isVectorBackendError = true;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to safe API response
   * @returns {Object} Safe error response
   */
  toAPIResponse() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
      // Don't expose internal details in production
      ...(process.env.NODE_ENV !== 'production' && { details: this.details })
    };
  }

  /**
   * Convert error to log format
   * @returns {Object} Structured log entry
   */
  toLogEntry() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Validation error - input parameters are invalid
 */
class ValidationError extends VectorBackendError {
  constructor(message, field, value, code = 'VALIDATION_ERROR') {
    super(message, code, { field, value });
    this.field = field;
    this.value = value;
  }

  toAPIResponse() {
    return {
      ...super.toAPIResponse(),
      field: this.field,
      message: 'Validation error'
    };
  }
}

/**
 * Search error - issues during search operations
 */
class SearchError extends VectorBackendError {
  constructor(message, code = 'SEARCH_ERROR', details = {}) {
    super(message, code, details);
    this.searchType = details.searchType || 'unknown';
    this.userId = details.userId;
  }
}

/**
 * Embedding error - issues with embedding generation or validation
 */
class EmbeddingError extends VectorBackendError {
  constructor(message, code = 'EMBEDDING_ERROR', details = {}) {
    super(message, code, details);
    this.embeddingDimensions = details.embeddingDimensions;
    this.provider = details.provider;
  }
}

/**
 * Database error - issues with database operations
 */
class DatabaseError extends VectorBackendError {
  constructor(message, code = 'DATABASE_ERROR', details = {}) {
    super(message, code, details);
    this.operation = details.operation;
    this.table = details.table;
    this.rpcFunction = details.rpcFunction;
  }
}

/**
 * AI worker error - issues with AI service calls
 */
class AIWorkerError extends VectorBackendError {
  constructor(message, code = 'AI_WORKER_ERROR', details = {}) {
    super(message, code, details);
    this.provider = details.provider;
    this.model = details.model;
    this.requestType = details.requestType;
  }
}

/**
 * Cache error - issues with caching operations
 */
class CacheError extends VectorBackendError {
  constructor(message, code = 'CACHE_ERROR', details = {}) {
    super(message, code, details);
    this.cacheType = details.cacheType;
    this.operation = details.operation;
  }
}

/**
 * Timeout error - operations exceeded time limits
 */
class TimeoutError extends VectorBackendError {
  constructor(message, timeoutMs, code = 'TIMEOUT_ERROR') {
    super(message, code, { timeoutMs });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Resource exhaustion error - system resources exceeded
 */
class ResourceError extends VectorBackendError {
  constructor(message, resource, code = 'RESOURCE_ERROR') {
    super(message, code, { resource });
    this.resource = resource;
  }
}

/**
 * Error handler with logging and monitoring hooks
 */
class ErrorHandler {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'VectorBackend';
    this.enableTelemetry = options.enableTelemetry !== false;
    this.logLevel = options.logLevel || 'error';
  }

  /**
   * Handle error with logging and optional monitoring
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {Object} Standardized error response
   */
  handle(error, context = {}) {
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
   * @param {Error} error - Error to standardize
   * @param {Object} context - Additional context
   * @returns {VectorBackendError} Standardized error
   */
  standardizeError(error, context = {}) {
    if (error.isVectorBackendError) {
      return error;
    }
    
    // Detect error type based on message patterns
    const message = error.message || 'Unknown error';
    
    if (message.includes('timeout') || error.code === 'ETIMEDOUT') {
      return new TimeoutError(message, context.timeout || 0);
    }
    
    if (message.includes('validation') || error.name === 'ValidationError') {
      return new ValidationError(message, context.field, context.value);
    }
    
    if (message.includes('database') || message.includes('RPC') || error.code === 'PGRST') {
      return new DatabaseError(message, 'DATABASE_ERROR', {
        operation: context.operation,
        rpcFunction: context.rpcFunction
      });
    }
    
    if (message.includes('embedding') || context.operation === 'embedding') {
      return new EmbeddingError(message, 'EMBEDDING_ERROR', {
        provider: context.provider,
        embeddingDimensions: context.embeddingDimensions
      });
    }
    
    if (message.includes('AI') || message.includes('worker') || context.operation === 'ai_worker') {
      return new AIWorkerError(message, 'AI_WORKER_ERROR', {
        provider: context.provider,
        model: context.model
      });
    }
    
    if (message.includes('cache') || context.operation === 'cache') {
      return new CacheError(message, 'CACHE_ERROR', {
        cacheType: context.cacheType
      });
    }
    
    // Default to generic search error
    return new SearchError(message, 'UNKNOWN_ERROR', {
      originalError: error.name,
      searchType: context.searchType
    });
  }

  /**
   * Log error with appropriate level
   * @param {VectorBackendError} error - Standardized error
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    const logEntry = {
      ...error.toLogEntry(),
      service: this.serviceName,
      context: this.sanitizeContext(context)
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
   * @param {VectorBackendError} error - Standardized error
   * @param {Object} context - Additional context
   */
  sendToMonitoring(error, context = {}) {
    // This would integrate with monitoring systems like:
    // - OpenTelemetry
    // - Datadog
    // - New Relic
    // - Custom telemetry endpoints
    
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[${this.serviceName}] Would send to monitoring:`, {
        error: error.toLogEntry(),
        context: this.sanitizeContext(context)
      });
    }
  }

  /**
   * Remove sensitive data from context before logging
   * @param {Object} context - Context to sanitize
   * @returns {Object} Sanitized context
   */
  sanitizeContext(context) {
    const sanitized = { ...context };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'embedding'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    // Truncate large objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
        sanitized[key] = sanitized[key].substring(0, 997) + '...';
      }
    });
    
    return sanitized;
  }
}

/**
 * Create error handler with service-specific configuration
 */
const createErrorHandler = (serviceName, options = {}) => {
  return new ErrorHandler({
    serviceName,
    ...options
  });
};

/**
 * Wrap async functions with error handling
 * @param {Function} fn - Async function to wrap
 * @param {ErrorHandler} errorHandler - Error handler instance
 * @param {Object} context - Context for error handling
 * @returns {Function} Wrapped function
 */
const withErrorHandling = (fn, errorHandler, context = {}) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const response = errorHandler.handle(error, context);
      
      // For API responses, return the error response
      // For internal operations, re-throw with standardized error
      if (context.returnResponse) {
        return response;
      } else {
        throw errorHandler.standardizeError(error, context);
      }
    }
  };
};

export { // Error classes
  VectorBackendError, ValidationError, SearchError, EmbeddingError, DatabaseError, AIWorkerError, CacheError, TimeoutError, ResourceError, // Error handler
  ErrorHandler, createErrorHandler, withErrorHandling };