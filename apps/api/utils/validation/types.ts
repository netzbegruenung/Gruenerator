/**
 * Validation Type Definitions
 */

/**
 * Validation error response
 */
export interface ValidationErrorResponse {
  success: false;
  error: string;
  message: string;
  field?: string;
  code: string;
}

/**
 * Numeric validation options
 */
export interface NumberValidationOptions {
  min?: number;
  max?: number;
  allowNull?: boolean;
}

/**
 * Validated search parameters
 */
export interface ValidatedSearchParams {
  query: string;
  user_id: string;
  limit: number;
  threshold: number | null;
  mode: 'vector' | 'hybrid' | 'keyword' | 'text';
  documentIds?: string[];
  group_id?: string;
  sourceType?: string;
}

/**
 * Raw search parameters input
 */
export interface SearchParamsInput {
  query: string;
  user_id: string;
  limit?: number;
  threshold?: number;
  mode?: string;
  documentIds?: any;
  group_id?: string;
}

/**
 * AI worker message
 */
export interface AIWorkerMessage {
  role: string;
  content: string;
}

/**
 * AI worker request
 */
export interface AIWorkerRequest {
  type: string;
  messages: AIWorkerMessage[];
  [key: string]: any;
}

/**
 * Validated AI worker request
 */
export interface ValidatedAIWorkerRequest {
  type: string;
  messages: AIWorkerMessage[];
  [key: string]: any;
}

/**
 * Path sanitization options
 */
export interface PathSanitizationOptions {
  createDir?: boolean;
}
