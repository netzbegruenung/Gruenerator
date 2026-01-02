/**
 * Content Detection Service
 * Utilities for detecting content types, analyzing markdown structure, and detecting URLs
 */

// Class exports
export { ContentDetector, contentDetector } from './ContentDetector.js';
export { UrlDetector, urlDetector } from './UrlDetector.js';

// Named function exports (backward compatibility)
export {
  detectContentType,
  detectMarkdownStructure,
  extractHeaderLevel,
  extractPageNumber,
  detectGermanPatterns
} from './ContentDetector.js';

export {
  detectUrls,
  extractUrlsFromContent,
  isValidUrl,
  getUrlDomain,
  filterNewUrls
} from './UrlDetector.js';

// Type exports
export type {
  ContentType,
  HeaderInfo,
  MarkdownStructure,
  GermanPatterns,
  UrlDetectionResult,
  AttachmentWithUrl
} from './types.js';

// Constant exports
export { URL_REGEX, URL_SCANNABLE_FIELDS } from './constants.js';
