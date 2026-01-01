/**
 * Document structure analysis and enhancement
 * Calculates complexity, infers document type, and enhances structure with metadata
 */

import type { DocumentStructure, DocumentMetadata } from './types.js';

/**
 * Enhance structure with additional analysis
 */
export function enhanceStructure(structure: DocumentStructure, text: string): DocumentStructure {
  // Calculate section boundaries
  structure.hierarchy.forEach((item, index) => {
    const nextItem = structure.hierarchy[index + 1];
    if (nextItem) {
      item.endPosition = nextItem.startPosition - 1;
      item.endLine = nextItem.startLine - 1;
    } else {
      item.endPosition = text.length;
      item.endLine = text.split('\n').length - 1;
    }

    // Calculate content length
    item.contentLength = item.endPosition - item.startPosition;
    item.content = text.substring(item.startPosition, item.endPosition);
  });

  // Add document-level metadata
  structure.metadata = {
    totalLines: text.split('\n').length,
    totalCharacters: text.length,
    hasChapters: structure.chapters.length > 0,
    hasSections: structure.sections.length > 0,
    hasLists: structure.lists.length > 0,
    hasTables: structure.tables.length > 0,
    structureComplexity: calculateComplexity(structure),
    documentType: inferDocumentType(structure)
  };

  return structure;
}

/**
 * Calculate document structure complexity
 */
export function calculateComplexity(structure: DocumentStructure): 'simple' | 'moderate' | 'complex' {
  let complexity = 0;
  complexity += structure.chapters.length * 3;
  complexity += structure.sections.length * 2;
  complexity += structure.lists.length * 1;
  complexity += structure.tables.length * 2;

  if (complexity <= 5) return 'simple';
  if (complexity <= 15) return 'moderate';
  return 'complex';
}

/**
 * Infer document type based on structure
 */
export function inferDocumentType(structure: DocumentStructure): DocumentMetadata['documentType'] {
  if (structure.chapters.length > 5) return 'book';
  if (structure.chapters.length > 0) return 'report';
  if (structure.sections.length > 10) return 'manual';
  if (structure.lists.length > structure.sections.length) return 'list_document';
  if (structure.tables.length > 0) return 'data_document';
  return 'article';
}
