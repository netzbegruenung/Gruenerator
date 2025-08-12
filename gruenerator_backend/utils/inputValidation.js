/**
 * Input validation and sanitization utilities
 * Prevents SQL injection and validates data types throughout the vector backend
 */

const { ValidationError } = require('./errorHandling.js');

/**
 * Comprehensive input validation for vector search operations
 */
class InputValidator {
  
  /**
   * Validate and sanitize embedding array for SQL safety
   * @param {Array} embedding - Embedding array to validate
   * @returns {string} Safe embedding string for database operations
   * @throws {ValidationError} If embedding is invalid
   */
  static validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      throw new ValidationError('Embedding must be an array', 'embedding', typeof embedding);
    }
    
    if (embedding.length === 0) {
      throw new ValidationError('Embedding cannot be empty', 'embedding', embedding.length);
    }
    
    if (embedding.length > 10000) { // Reasonable upper bound
      throw new ValidationError('Embedding too large', 'embedding', embedding.length);
    }
    
    // Validate each element is a valid number
    for (let i = 0; i < embedding.length; i++) {
      const value = embedding[i];
      
      if (typeof value !== 'number') {
        throw new ValidationError(`Embedding element at index ${i} must be a number`, 'embedding', value);
      }
      
      if (!isFinite(value)) {
        throw new ValidationError(`Embedding element at index ${i} must be finite`, 'embedding', value);
      }
      
      if (Math.abs(value) > 100) { // Reasonable bounds for embedding values
        throw new ValidationError(`Embedding element at index ${i} out of bounds`, 'embedding', value);
      }
    }
    
    // Create safe string representation
    // Use JSON.stringify to ensure proper escaping of all values
    return JSON.stringify(embedding);
  }

  /**
   * Validate user ID
   * @param {string} userId - User ID to validate
   * @returns {string} Validated user ID
   * @throws {ValidationError} If user ID is invalid
   */
  static validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('User ID must be a non-empty string', 'userId', userId);
    }
    
    // Sanitize user ID - only allow alphanumeric, hyphens, underscores
    const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 100) {
      throw new ValidationError('User ID must be 1-100 alphanumeric characters', 'userId', userId);
    }
    
    return sanitized;
  }

  /**
   * Validate document IDs array
   * @param {Array} documentIds - Array of document IDs
   * @returns {Array} Validated document IDs
   * @throws {ValidationError} If document IDs are invalid
   */
  static validateDocumentIds(documentIds) {
    if (!Array.isArray(documentIds)) {
      throw new ValidationError('Document IDs must be an array', 'documentIds', typeof documentIds);
    }
    
    if (documentIds.length > 1000) { // Reasonable upper bound
      throw new ValidationError('Too many document IDs', 'documentIds', documentIds.length);
    }
    
    return documentIds.map((id, index) => {
      if (!id || typeof id !== 'string') {
        throw new ValidationError(`Document ID at index ${index} must be a string`, 'documentIds', id);
      }
      
      // Sanitize document ID
      const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');
      
      if (sanitized.length === 0 || sanitized.length > 100) {
        throw new ValidationError(`Document ID at index ${index} invalid format`, 'documentIds', id);
      }
      
      return sanitized;
    });
  }

  /**
   * Validate search query
   * @param {string} query - Search query to validate
   * @returns {string} Validated query
   * @throws {ValidationError} If query is invalid
   */
  static validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Search query must be a non-empty string', 'query', query);
    }
    
    const trimmed = query.trim();
    
    if (trimmed.length === 0) {
      throw new ValidationError('Search query cannot be empty', 'query', query);
    }
    
    if (trimmed.length > 10000) {
      throw new ValidationError('Search query too long', 'query', trimmed.length);
    }
    
    return trimmed;
  }

  /**
   * Validate numeric parameters
   * @param {number} value - Value to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {Object} options - Validation options
   * @returns {number} Validated value
   * @throws {ValidationError} If value is invalid
   */
  static validateNumber(value, fieldName, options = {}) {
    const { min = 0, max = Number.MAX_SAFE_INTEGER, allowNull = false } = options;
    
    if (allowNull && (value === null || value === undefined)) {
      return null;
    }
    
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new ValidationError(`${fieldName} must be a finite number`, fieldName, value);
    }
    
    if (value < min || value > max) {
      throw new ValidationError(`${fieldName} must be between ${min} and ${max}`, fieldName, value);
    }
    
    return value;
  }

  /**
   * Validate search parameters object
   * @param {Object} params - Search parameters to validate
   * @returns {Object} Validated parameters
   * @throws {ValidationError} If parameters are invalid
   */
  static validateSearchParams(params) {
    if (!params || typeof params !== 'object') {
      throw new ValidationError('Search parameters must be an object', 'params', params);
    }
    
    const validated = {};
    
    // Required fields
    validated.query = this.validateSearchQuery(params.query);
    validated.user_id = this.validateUserId(params.user_id);
    
    // Optional fields with defaults
    validated.limit = this.validateNumber(
      params.limit || 5, 
      'limit', 
      { min: 1, max: 100 }
    );
    
    validated.threshold = this.validateNumber(
      params.threshold, 
      'threshold', 
      { min: 0, max: 1, allowNull: true }
    );
    
    // Validate mode
    const validModes = ['vector', 'hybrid', 'keyword'];
    if (params.mode && !validModes.includes(params.mode)) {
      throw new ValidationError('Invalid search mode', 'mode', params.mode);
    }
    validated.mode = params.mode || 'vector';
    
    // Validate document IDs if provided
    if (params.documentIds) {
      validated.documentIds = this.validateDocumentIds(params.documentIds);
    }
    
    // Validate group ID if provided
    if (params.group_id) {
      validated.group_id = this.validateUserId(params.group_id); // Same validation as user ID
    }
    
    return validated;
  }

  /**
   * Validate content type for examples search
   * @param {string} contentType - Content type to validate
   * @returns {string} Validated content type
   * @throws {ValidationError} If content type is invalid
   */
  static validateContentType(contentType) {
    if (!contentType || typeof contentType !== 'string') {
      throw new ValidationError('Content type must be a non-empty string', 'contentType', contentType);
    }
    
    const sanitized = contentType.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 50) {
      throw new ValidationError('Content type must be 1-50 alphanumeric characters', 'contentType', contentType);
    }
    
    return sanitized;
  }

  /**
   * Create safe error response (without exposing sensitive data)
   * @param {Error} error - Error to convert to safe response
   * @returns {Object} Safe error response
   */
  static createSafeErrorResponse(error) {
    if (error instanceof ValidationError) {
      return {
        success: false,
        error: 'Validation error',
        message: error.message,
        field: error.field,
        code: 'VALIDATION_ERROR'
      };
    }
    
    // For other errors, don't expose internal details
    return {
      success: false,
      error: 'Internal error',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR'
    };
  }

  /**
   * Validate AI worker request parameters
   * @param {Object} request - AI worker request to validate
   * @returns {Object} Validated request
   * @throws {ValidationError} If request is invalid
   */
  static validateAIWorkerRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new ValidationError('AI worker request must be an object', 'request', request);
    }
    
    const validated = { ...request };
    
    // Validate type
    if (!request.type || typeof request.type !== 'string') {
      throw new ValidationError('AI worker request type is required', 'type', request.type);
    }
    
    // Validate messages array
    if (!Array.isArray(request.messages)) {
      throw new ValidationError('Messages must be an array', 'messages', request.messages);
    }
    
    if (request.messages.length === 0) {
      throw new ValidationError('Messages cannot be empty', 'messages', request.messages.length);
    }
    
    // Validate each message
    validated.messages = request.messages.map((msg, index) => {
      if (!msg || typeof msg !== 'object') {
        throw new ValidationError(`Message at index ${index} must be an object`, 'messages', msg);
      }
      
      if (!msg.role || !msg.content) {
        throw new ValidationError(`Message at index ${index} must have role and content`, 'messages', msg);
      }
      
      if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
        throw new ValidationError(`Message content at index ${index} must be non-empty string`, 'messages', msg.content);
      }
      
      if (msg.content.length > 50000) { // Reasonable limit
        throw new ValidationError(`Message content at index ${index} too long`, 'messages', msg.content.length);
      }
      
      return {
        role: msg.role,
        content: msg.content.trim()
      };
    });
    
    return validated;
  }
}

module.exports = {
  InputValidator,
  ValidationError
};