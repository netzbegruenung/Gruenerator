/**
 * DocumentQnAService - Barrel exports
 *
 * Re-exports all types and functions from DocumentQnAService modules.
 * Note: This service requires constructor parameters (redis, mistral clients),
 * so no singleton instance is provided.
 */

// Main class
export { DocumentQnAService } from './DocumentQnAService.js';

// Re-export all types
export type {
  AgentType,
  Intent,
  Attachment,
  StoredDocument,
  KnowledgeExtractionOptions,
  MistralContentItem,
  CacheKeyComponents,
  ClearUserDataResult,
} from './types.js';

// Re-export module functions (for direct use if needed)
export {
  getDocumentsFromRedis,
  storeAttachment,
  storeAttachments,
  getRecentDocuments,
  clearUserDocuments,
} from './redisOperations.js';

export { generateQuestionsForIntent } from './contextExtraction.js';

export { askMistralAboutDocuments } from './mistralIntegration.js';

export { generateCacheKey, getCachedKnowledge, cacheKnowledge } from './contextManagement.js';

// Default export
export { DocumentQnAService as default } from './DocumentQnAService.js';
