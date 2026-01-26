/**
 * Text Processing Service
 * Centralized utilities for text cleaning and normalization
 */

// Cleaning exports
export { cleanTextForEmbedding, removeMarkdownImages, collapseBlankLines } from './cleaning.js';

// Normalization exports
export {
  foldUmlauts,
  normalizeUnicodeNumbers,
  normalizeQuery,
  normalizeText,
  tokenizeQuery,
  generateQueryVariants,
  containsNormalized,
} from './normalization.js';

// Type exports
export type { CleaningOptions, NormalizationOptions } from './types.js';

// Constant exports
export {
  SUBSCRIPT_MAP,
  SUPERSCRIPT_MAP,
  GERMAN_CHARS,
  DASH_CHARS,
  SOFT_HYPHEN,
} from './constants.js';
