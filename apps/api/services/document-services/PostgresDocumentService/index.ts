/**
 * PostgresDocumentService - Barrel exports with singleton
 *
 * Re-exports all types and functions from PostgresDocumentService modules.
 * Provides singleton instance for backward compatibility.
 */

// Main class
export { PostgresDocumentService } from './PostgresDocumentService.js';

// Re-export all types
export type {
  UserDocumentMode,
  DocumentMetadata,
  DocumentRecord,
  DocumentUpdateData,
  UserTextDocument,
  DocumentStats,
  BulkDeleteResult,
  UserDocumentModeResult,
  DeleteResult,
  DocumentWithText
} from './types.js';

// Re-export module functions (for direct use if needed)
export {
  saveDocumentMetadata,
  updateDocumentMetadata,
  getDocumentsBySourceType,
  getDocumentById,
  deleteDocument,
  bulkDeleteDocuments
} from './metadataOperations.js';

export {
  storeDocumentText,
  getDocumentText,
  createDocumentWithText
} from './textOperations.js';

export {
  getDocumentByWolkeFile
} from './wolkeOperations.js';

export {
  getUserDocumentMode,
  setUserDocumentMode
} from './userPreferences.js';

export {
  getDocumentStats,
  getUserTexts
} from './statistics.js';

// Singleton instance (for backward compatibility)
import { PostgresDocumentService } from './PostgresDocumentService.js';

let postgresDocumentServiceInstance: PostgresDocumentService | null = null;

export function getPostgresDocumentService(): PostgresDocumentService {
  if (!postgresDocumentServiceInstance) {
    postgresDocumentServiceInstance = new PostgresDocumentService();
  }
  return postgresDocumentServiceInstance;
}

// Default export
export default PostgresDocumentService;
