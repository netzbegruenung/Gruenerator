/**
 * Semantic boundary finding for document chunking
 * Identifies natural break points in document structure
 */

import type { DocumentStructure, SemanticBoundary, StructureItem } from './types.js';

/**
 * Find semantic boundaries for chunking
 */
export function findSemanticBoundaries(
  text: string,
  structure: DocumentStructure
): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];

  // Add all structural boundaries
  structure.hierarchy.forEach((item) => {
    boundaries.push({
      position: item.startPosition,
      type: item.type,
      level: item.level,
      title: item.title,
      importance: getBoundaryImportance(item.type),
    });
  });

  // Add paragraph boundaries for sections without subsections
  const paragraphBoundaries = findParagraphBoundaries(text, structure);
  boundaries.push(...paragraphBoundaries);

  // Sort by position
  boundaries.sort((a, b) => a.position - b.position);

  return boundaries;
}

/**
 * Find paragraph boundaries
 */
export function findParagraphBoundaries(
  text: string,
  structure: DocumentStructure
): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine === '') {
      if (inParagraph) {
        // End of paragraph
        boundaries.push({
          position: position,
          type: 'paragraph',
          level: 5,
          importance: 1,
        });
        inParagraph = false;
      }
    } else {
      if (!inParagraph) {
        // Start of new paragraph
        inParagraph = true;
      }
    }

    position += line.length + 1; // +1 for newline
  }

  return boundaries;
}

/**
 * Get boundary importance (for chunking decisions)
 */
export function getBoundaryImportance(
  type: StructureItem['type'] | 'paragraph' | 'list' | 'table'
): number {
  const importance: Record<string, number> = {
    chapter: 5,
    section: 4,
    subsection: 3,
    paragraph: 1,
    list: 2,
    table: 2,
  };
  return importance[type] || 1;
}
