/**
 * Unified Error Handling System
 *
 * Consolidates errorHandling.js and errorHandler.js into a single TypeScript module
 *
 * Organization:
 * - types.ts: TypeScript interfaces and types
 * - constants.ts: Error messages and configuration
 * - classes.ts: Structured error classes (domain errors)
 * - handlers.ts: ErrorHandler with monitoring/telemetry
 * - routes.ts: Express route error handling (HTTP layer)
 *
 * Usage:
 * - Domain/Service Layer: Use error classes (ValidationError, SearchError, etc.)
 * - HTTP/Route Layer: Use route handlers (withErrorHandler, handleRouteError, etc.)
 */

// ============================================================================
// ERROR CLASSES (Domain Layer)
// ============================================================================
export {
  VectorBackendError,
  ValidationError,
  SearchError,
  EmbeddingError,
  DatabaseError,
  AiClientError,
  CacheError,
  TimeoutError,
  ResourceError,
  isVectorBackendError,
} from './classes.js';

// ============================================================================
// ERROR HANDLER (Service Layer - Monitoring & Telemetry)
// ============================================================================
export {
  ErrorHandler,
  createErrorHandler,
  withErrorHandling,
  getErrorMessage,
  toError,
} from './handlers.js';

// ============================================================================
// ROUTE ERROR HANDLERS (HTTP Layer)
// ============================================================================
export {
  classifyError,
  handleRouteError,
  handleValidationError,
  handleAttachmentError,
  handleAiClientError,
  withErrorHandler,
  addCorrelationId,
} from './routes.js';

// ============================================================================
// USER-FACING MESSAGES (async jobs + response bodies)
// ============================================================================
export {
  toJobError,
  toUserFacingMessage,
  classifyUserFacingError,
  GENERIC_ERROR_MESSAGE,
} from './userFacing.js';

// ============================================================================
// CONSTANTS
// ============================================================================
export { ERROR_TYPES } from './constants.js';

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type * from './types.js';
