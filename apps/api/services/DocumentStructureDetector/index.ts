/**
 * DocumentStructureDetector Module Exports
 *
 * Barrel export file for DocumentStructureDetector module.
 * Provides clean API surface for external consumers.
 */

// Main class
export { DocumentStructureDetector } from './DocumentStructureDetector.js';

// Re-export all type definitions
export type {
  PatternCollection,
  Chapter,
  Section,
  ListItem,
  TableItem,
  PageBreak,
  StructureItem,
  DocumentMetadata,
  DocumentStructure,
  SemanticBoundary,
  ChapterMatch,
  SectionMatch,
  ListMatch,
} from './types.js';

// Export pattern collection
export { patterns } from './patterns.js';

// Export detection functions (if needed externally)
export {
  detectChapter,
  detectSection,
  detectList,
  isTableLine,
  isPageBreak,
  calculateSectionLevel,
  getPositionFromLine,
  getListType,
} from './detection.js';

// Export analysis functions (if needed externally)
export { enhanceStructure, calculateComplexity, inferDocumentType } from './analysis.js';

// Export boundary functions (if needed externally)
export {
  findSemanticBoundaries,
  findParagraphBoundaries,
  getBoundaryImportance,
} from './boundaries.js';

// Create and export singleton instance
import { DocumentStructureDetector } from './DocumentStructureDetector.js';
export const documentStructureDetector = new DocumentStructureDetector();

// Default export
export { DocumentStructureDetector as default } from './DocumentStructureDetector.js';
