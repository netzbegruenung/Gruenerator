/**
 * DocumentContentService - Barrel exports with singleton
 *
 * Re-exports all types and functions from DocumentContentService modules.
 * Provides singleton instance for backward compatibility.
 */

// Main class
export { DocumentContentService } from './DocumentContentService.js';

// Re-export all types
export type {
  ContentSearchOptions,
  DocumentContentResult,
  ContentSearchResponse,
  ContentSearchMetadata,
  ContentStrategyDecision,
  ExcerptOptions,
  TextMatch
} from './types.js';

// Re-export module functions (for direct use if needed)
export {
  getAccessibleDocuments,
  getAccessibleDocumentIds
} from './accessControl.js';

export {
  determineContentStrategy,
  createIntelligentExcerpt,
  extractRelevantText
} from './contentExtraction.js';

export {
  performVectorSearch,
  processVectorSearchResults,
  fillMissingDocuments,
  createSearchResponse
} from './searchOperations.js';

// Singleton instance (for backward compatibility)
import { DocumentContentService } from './DocumentContentService.js';

let documentContentServiceInstance: DocumentContentService | null = null;

export function getDocumentContentService(): DocumentContentService {
  if (!documentContentServiceInstance) {
    documentContentServiceInstance = new DocumentContentService();
  }
  return documentContentServiceInstance;
}
