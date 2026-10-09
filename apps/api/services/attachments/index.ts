/**
 * Attachment Services Barrel Export
 * Provides backward-compatible exports for all attachment utilities
 */

// Class exports
export { AttachmentProcessor, attachmentProcessor } from './AttachmentProcessor.js';

// Named function exports from AttachmentProcessor (backward compatibility)
export {
  validateAttachments,
  buildMessagesWithAttachments,
  enhanceSystemPromptWithAttachments,
  createAttachmentsSummary,
  hasValidAttachments,
  processAttachmentsForRoute,
  buildDocumentsForPromptBuilder,
  logAttachmentProcessing,
  processAndBuildAttachments,
} from './AttachmentProcessor.js';

// Type exports
export type {
  Attachment,
  FileAttachment,
  CrawledUrlAttachment,
  ImageAttachment,
  AttachmentProcessingResult,
  AttachmentSummary,
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeImageBlock,
  ClaudeDocumentBlock,
  ClaudeMessage,
  ClaudeDocument,
} from './types.js';

// Constant exports
export {
  ALLOWED_MIME_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
} from './constants.js';
