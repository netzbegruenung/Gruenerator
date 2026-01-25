/**
 * Input validation and sanitization utilities
 * Prevents SQL injection and validates data types throughout the vector backend
 */

import { ValidationError } from '../errors/index.js';
import type {
  ValidationErrorResponse,
  NumberValidationOptions,
  ValidatedSearchParams,
  SearchParamsInput,
  ValidatedAIWorkerRequest,
  AIWorkerRequest,
} from './types.js';

/**
 * Comprehensive input validation for vector search operations
 */
export class InputValidator {
  /**
   * Validate and sanitize embedding array for SQL safety
   */
  static validateEmbedding(embedding: any): string {
    if (!Array.isArray(embedding)) {
      throw new ValidationError('Embedding must be an array', 'embedding', typeof embedding);
    }

    if (embedding.length === 0) {
      throw new ValidationError('Embedding cannot be empty', 'embedding', embedding.length);
    }

    if (embedding.length > 10000) {
      // Reasonable upper bound
      throw new ValidationError('Embedding too large', 'embedding', embedding.length);
    }

    // Validate each element is a valid number
    for (let i = 0; i < embedding.length; i++) {
      const value = embedding[i];

      if (typeof value !== 'number') {
        throw new ValidationError(
          `Embedding element at index ${i} must be a number`,
          'embedding',
          value
        );
      }

      if (!isFinite(value)) {
        throw new ValidationError(
          `Embedding element at index ${i} must be finite`,
          'embedding',
          value
        );
      }

      if (Math.abs(value) > 100) {
        // Reasonable bounds for embedding values
        throw new ValidationError(
          `Embedding element at index ${i} out of bounds`,
          'embedding',
          value
        );
      }
    }

    // Create safe string representation
    // Use JSON.stringify to ensure proper escaping of all values
    return JSON.stringify(embedding);
  }

  /**
   * Validate user ID
   */
  static validateUserId(userId: any): string {
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
   */
  static validateDocumentIds(documentIds: any): string[] {
    if (!Array.isArray(documentIds)) {
      throw new ValidationError('Document IDs must be an array', 'documentIds', typeof documentIds);
    }

    if (documentIds.length > 1000) {
      // Reasonable upper bound
      throw new ValidationError('Too many document IDs', 'documentIds', documentIds.length);
    }

    return documentIds.map((id: any, index: number) => {
      if (!id || typeof id !== 'string') {
        throw new ValidationError(
          `Document ID at index ${index} must be a string`,
          'documentIds',
          id
        );
      }

      // Sanitize document ID
      const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');

      if (sanitized.length === 0 || sanitized.length > 100) {
        throw new ValidationError(
          `Document ID at index ${index} invalid format`,
          'documentIds',
          id
        );
      }

      return sanitized;
    });
  }

  /**
   * Validate search query
   */
  static validateSearchQuery(query: any): string {
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
   */
  static validateNumber(
    value: any,
    fieldName: string,
    options: NumberValidationOptions = {}
  ): number | null {
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
   */
  static validateSearchParams(params: SearchParamsInput): ValidatedSearchParams {
    if (!params || typeof params !== 'object') {
      throw new ValidationError('Search parameters must be an object', 'params', params);
    }

    const validated: ValidatedSearchParams = {
      query: '',
      user_id: '',
      limit: 5,
      threshold: null,
      mode: 'vector',
    };

    // Required fields
    validated.query = this.validateSearchQuery(params.query);
    validated.user_id = this.validateUserId(params.user_id);

    // Optional fields with defaults
    validated.limit = this.validateNumber(params.limit || 5, 'limit', {
      min: 1,
      max: 100,
    }) as number;

    validated.threshold = this.validateNumber(params.threshold, 'threshold', {
      min: 0,
      max: 1,
      allowNull: true,
    });

    // Validate mode
    const validModes: Array<'vector' | 'hybrid' | 'keyword' | 'text'> = [
      'vector',
      'hybrid',
      'keyword',
      'text',
    ];
    if (params.mode && !validModes.includes(params.mode as any)) {
      throw new ValidationError('Invalid search mode', 'mode', params.mode);
    }
    validated.mode = (params.mode as 'vector' | 'hybrid' | 'keyword' | 'text') || 'vector';

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
   */
  static validateContentType(contentType: any): string {
    if (!contentType || typeof contentType !== 'string') {
      throw new ValidationError(
        'Content type must be a non-empty string',
        'contentType',
        contentType
      );
    }

    const sanitized = contentType.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (sanitized.length === 0 || sanitized.length > 50) {
      throw new ValidationError(
        'Content type must be 1-50 alphanumeric characters',
        'contentType',
        contentType
      );
    }

    return sanitized;
  }

  /**
   * Create safe error response (without exposing sensitive data)
   */
  static createSafeErrorResponse(error: Error): ValidationErrorResponse {
    if (error instanceof ValidationError) {
      return {
        success: false,
        error: 'Validation error',
        message: error.message,
        field: (error as any).field,
        code: 'VALIDATION_ERROR',
      };
    }

    // For other errors, don't expose internal details
    return {
      success: false,
      error: 'Internal error',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
  }

  /**
   * Validate AI worker request parameters
   */
  static validateAIWorkerRequest(request: AIWorkerRequest): ValidatedAIWorkerRequest {
    if (!request || typeof request !== 'object') {
      throw new ValidationError('AI worker request must be an object', 'request', request);
    }

    const validated: ValidatedAIWorkerRequest = { ...request };

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
    validated.messages = request.messages.map((msg: any, index: number) => {
      if (!msg || typeof msg !== 'object') {
        throw new ValidationError(`Message at index ${index} must be an object`, 'messages', msg);
      }

      if (!msg.role || !msg.content) {
        throw new ValidationError(
          `Message at index ${index} must have role and content`,
          'messages',
          msg
        );
      }

      if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
        throw new ValidationError(
          `Message content at index ${index} must be non-empty string`,
          'messages',
          msg.content
        );
      }

      if (msg.content.length > 50000) {
        // Reasonable limit
        throw new ValidationError(
          `Message content at index ${index} too long`,
          'messages',
          msg.content.length
        );
      }

      return {
        role: msg.role,
        content: msg.content.trim(),
      };
    });

    return validated;
  }
}

export default InputValidator;

// Named export for backward compatibility
export { ValidationError };
