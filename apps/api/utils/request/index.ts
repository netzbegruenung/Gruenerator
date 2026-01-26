/**
 * Request/Response Utilities Barrel Export
 * Provides all request enrichment, response formatting, and message preprocessing utilities
 */

// Response Formatter exports
export {
  createSuccessResponse,
  createSuccessResponseWithAttachments,
  createErrorResponse,
  sendSuccessResponse,
  sendSuccessResponseWithAttachments,
  sendErrorResponse,
  default as responseFormatter,
} from './formatter.js';

// Message Preprocessor exports
export {
  toOpenAICompatibleMessages,
  default as messagePreprocessor,
} from './messagePreprocessor.js';

// Type exports
export type * from './types.js';

// Note: requestEnrichment.js remains as .js for now due to complex dependencies
// It will be migrated in a future phase
