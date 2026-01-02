/**
 * Content Detection Service
 * Utilities for detecting content types and analyzing markdown structure
 */

// Class exports
export { ContentDetector, contentDetector } from './ContentDetector.js';

// Named function exports (backward compatibility)
export {
  detectContentType,
  detectMarkdownStructure,
  extractHeaderLevel,
  extractPageNumber,
  detectGermanPatterns
} from './ContentDetector.js';

// Type exports
export type {
  ContentType,
  HeaderInfo,
  MarkdownStructure,
  GermanPatterns
} from './types.js';
