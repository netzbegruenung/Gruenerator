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
  field?: string | undefined;
  code: string;
}

/**
 * Numeric validation options
 */
export interface NumberValidationOptions {
  min?: number | undefined;
  max?: number | undefined;
  allowNull?: boolean | undefined;
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
  documentIds?: string[] | undefined;
  group_id?: string | undefined;
  sourceType?: string | undefined;
}

/**
 * Raw search parameters input
 */
export interface SearchParamsInput {
  query: string;
  user_id: string;
  limit?: number | undefined;
  threshold?: number | undefined;
  mode?: string | undefined;
  documentIds?: unknown | undefined;
  group_id?: string | undefined;
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
  [key: string]: unknown;
}

/**
 * Validated AI worker request
 */
export interface ValidatedAIWorkerRequest {
  type: string;
  messages: AIWorkerMessage[];
  [key: string]: unknown;
}

/**
 * Path sanitization options
 */
export interface PathSanitizationOptions {
  createDir?: boolean | undefined;
}
