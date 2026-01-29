/**
 * DocumentProcessingService - Barrel exports with singleton
 *
 * Re-exports all types and functions from DocumentProcessingService modules.
 * Provides singleton instance for backward compatibility.
 */

// Main class
export { DocumentProcessingService } from './DocumentProcessingService.js';

// Re-export all types
export type {
  ChunkingOptions,
  ChunkAndEmbedResult,
  ProcessingResult,
  FileUploadResult,
  TextProcessingResult,
  UrlProcessingResult,
  UploadedFile,
  OcrExtractionResult,
} from './types.js';

// Re-export module functions (for direct use if needed)
export { extractTextFromFile, generateContentPreview } from './textExtraction.js';

export { chunkAndEmbedText } from './chunkingPipeline.js';

export { processFileUpload, processUploadedDocument } from './fileProcessing.js';

export { processTextContent } from './textProcessing.js';

export { processUrlContent } from './urlProcessing.js';

// Singleton instance (for backward compatibility)
import { DocumentProcessingService } from './DocumentProcessingService.js';

let documentProcessingServiceInstance: DocumentProcessingService | null = null;

export function getDocumentProcessingService(): DocumentProcessingService {
  if (!documentProcessingServiceInstance) {
    documentProcessingServiceInstance = new DocumentProcessingService();
  }
  return documentProcessingServiceInstance;
}
