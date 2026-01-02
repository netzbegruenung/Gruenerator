/**
 * Parameter Extractor Module
 * Barrel export for backward compatibility and clean imports
 */

// Main extraction functions
export { extractParameters, analyzeParameterConfidence, extractQuoteAuthor } from './ParameterExtractor.js';

// Type exports
export type {
  BaseParameters,
  ExtractedParameters,
  SocialMediaParameters,
  GrueneJugendParameters,
  AntragParameters,
  SharepicParameters,
  ZitatParameters,
  DreiZeilenParameters,
  ImagineParameters,
  UniversalParameters,
  LeichteSpracheParameters,
  AuthorExtractionResult,
  VariantResult,
  LinesExtractionResult,
  ConfidenceAnalysis
} from './types.js';

// Utility exports (for advanced use cases)
export {
  extractTheme,
  extractDetails,
  extractPlatforms,
  extractTextForm,
  extractStyle,
  extractStructure,
  determineRequestType,
  extractLines
} from './utils/extractionUtils.js';

export {
  detectImagineMode,
  extractImagineSubject,
  extractImagineVariant,
  extractImagineTitle,
  extractEditAction
} from './utils/imagineUtils.js';
