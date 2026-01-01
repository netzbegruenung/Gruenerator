/**
 * Error Handler Utility
 * 
 * Provides secure error handling with consistent error responses
 * Prevents information leakage while maintaining good debugging capabilities
 */

import { sendErrorResponse } from './responseFormatter.js';

/**
 * Common error types and their user-friendly messages
 */
const ERROR_TYPES = {
  VALIDATION_ERROR: 'Ungültige Eingabedaten',
  ATTACHMENT_ERROR: 'Fehler bei der Verarbeitung der Anhänge',
  AI_WORKER_ERROR: 'Fehler bei der KI-Textgenerierung',
  AUTHENTICATION_ERROR: 'Authentifizierung erforderlich',
  AUTHORIZATION_ERROR: 'Keine Berechtigung für diese Aktion',
  NETWORK_ERROR: 'Netzwerkfehler - bitte versuchen Sie es später erneut',
  INTERNAL_ERROR: 'Interner Serverfehler',
  TIMEOUT_ERROR: 'Anfrage-Timeout - bitte versuchen Sie es erneut',
  RATE_LIMIT_ERROR: 'Zu viele Anfragen - bitte warten Sie einen Moment'
};

/**
 * Maps error messages to error types for classification
 */
const classifyError = (error) => {
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
      error.status === 401) {
    return { type: 'AUTHENTICATION_ERROR', statusCode: 401 };
  }
  
  // Authorization errors
  if (message.includes('forbidden') || message.includes('authorization') || 
      error.status === 403) {
    return { type: 'AUTHORIZATION_ERROR', statusCode: 403 };
  }
  
  // Network errors
  if (message.includes('network') || message.includes('connection') || 
      message.includes('enotfound') || message.includes('timeout')) {
    return { type: 'NETWORK_ERROR', statusCode: 503 };
  }
  
  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many') || 
      error.status === 429) {
    return { type: 'RATE_LIMIT_ERROR', statusCode: 429 };
  }
  
  // Default to internal error
  return { type: 'INTERNAL_ERROR', statusCode: 500 };
};

/**
 * Handles route errors with secure responses and detailed logging
 * @param {Error} error - The error object
 * @param {string} routePath - Route path for logging context
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object (optional, for additional context)
 */
const handleRouteError = (error, routePath, res, req = null) => {
  // Classify the error
  const { type, statusCode } = classifyError(error);
  const userMessage = ERROR_TYPES[type];
  
  // Add request context for detailed logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  const userId = req?.user?.id || 'unknown';
  const requestId = req?.correlationId || req?.sessionID || 'unknown';
  
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
};

/**
 * Handles validation errors specifically (for common validation patterns)
 * @param {Object} res - Express response object
 * @param {string} routePath - Route path
 * @param {string} message - Specific validation message
 */
const handleValidationError = (res, routePath, message) => {
  const error = new Error(`Validation failed: ${message}`);
  handleRouteError(error, routePath, res);
};

/**
 * Handles attachment errors specifically
 * @param {Object} res - Express response object
 * @param {string} routePath - Route path
 * @param {string} message - Specific attachment error message
 */
const handleAttachmentError = (res, routePath, message) => {
  const error = new Error(`Attachment error: ${message}`);
  handleRouteError(error, routePath, res);
};

/**
 * Handles AI Worker errors specifically
 * @param {Object} res - Express response object
 * @param {string} routePath - Route path
 * @param {Object} aiResult - AI worker result object with error
 */
const handleAIWorkerError = (res, routePath, aiResult) => {
  const error = new Error(`AI Worker failed: ${aiResult.error || 'Unknown AI error'}`);
  handleRouteError(error, routePath, res);
};

/**
 * Wraps async route handlers with consistent error handling
 * @param {Function} handler - The async route handler function
 * @param {string} routePath - Route path for error context
 * @returns {Function} Wrapped route handler
 */
const withErrorHandler = (handler, routePath) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleRouteError(error, routePath, res, req);
    }
  };
};

/**
 * Middleware to add correlation IDs to requests for better error tracking
 */
const addCorrelationId = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || 
                     req.sessionID || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  next();
};

export { ERROR_TYPES, handleRouteError, handleValidationError, handleAttachmentError, handleAIWorkerError, withErrorHandler, addCorrelationId, classifyError };