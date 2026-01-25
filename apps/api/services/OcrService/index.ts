/**
 * OcrService Module Exports
 *
 * Barrel export file for OcrService module.
 * Provides clean API surface for external consumers.
 */

// Main class
export { OCRService } from './OcrService.js';

// Re-export all type definitions
export type {
  DocumentLimits,
  ParseabilityCheck,
  ExtractionResult,
  DocumentExtractionResult,
  PageExtractionResult,
  PDFInfo,
  EmbeddingGenerationResult,
  MistralOCRResponse,
  MistralFileUploadResult,
  ProcessingMetadata,
} from './types.js';

// Export validation utilities (if needed externally)
export { validateDocumentLimits, getMediaType } from './validation.js';

// Export formatting utilities (if needed externally)
export {
  applyMarkdownFormatting,
  isLikelyHeading,
  determineHeadingLevel,
} from './textFormatting.js';

// Create and export singleton instance (for backward compatibility)
import { OCRService } from './OcrService.js';
export const ocrService = new OCRService();

// Default export
export { OCRService as default } from './OcrService.js';
