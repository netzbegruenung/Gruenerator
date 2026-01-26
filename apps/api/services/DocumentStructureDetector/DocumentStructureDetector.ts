/**
 * Document Structure Detector
 * Detects hierarchical structure in documents (chapters, sections, paragraphs)
 * for better context-aware chunking
 */

import { patterns } from './patterns.js';
import {
  detectChapter,
  detectSection,
  detectList,
  isTableLine,
  isPageBreak,
  calculateSectionLevel,
  getPositionFromLine,
} from './detection.js';
import { enhanceStructure } from './analysis.js';
import { findSemanticBoundaries } from './boundaries.js';
import type { PatternCollection, DocumentStructure, SemanticBoundary } from './types.js';

/**
 * DocumentStructureDetector class
 * Analyzes document structure and provides semantic boundaries for chunking
 */
export class DocumentStructureDetector {
  public readonly patterns: PatternCollection;

  constructor() {
    this.patterns = patterns;
  }

  /**
   * Analyze document structure
   */
  analyzeStructure(text: string): DocumentStructure {
    const lines = text.split('\n');
    const structure: DocumentStructure = {
      chapters: [],
      sections: [],
      lists: [],
      tables: [],
      pageBreaks: [],
      hierarchy: [],
      metadata: {
        totalLines: 0,
        totalCharacters: 0,
        hasChapters: false,
        hasSections: false,
        hasLists: false,
        hasTables: false,
        structureComplexity: 'simple',
        documentType: 'article',
      },
    };

    let currentChapter: (typeof structure.chapters)[number] | null = null;
    let currentSection: (typeof structure.sections)[number] | null = null;
    let lineIndex = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        lineIndex++;
        continue;
      }

      // Detect sections FIRST (to avoid numbered sections being treated as chapters)
      const sectionMatch = detectSection(line);
      if (sectionMatch) {
        const section = {
          type: 'section' as const,
          level: calculateSectionLevel(sectionMatch.number),
          title: sectionMatch.title,
          number: sectionMatch.number,
          startLine: lineIndex,
          startPosition: getPositionFromLine(text, lineIndex),
          parentChapter: currentChapter?.title,
        };

        structure.sections.push(section);
        structure.hierarchy.push(section);

        if (currentChapter) {
          currentChapter.sections.push(section);
        }

        currentSection = section;
      }
      // Detect chapters (only if not already matched as section)
      else {
        const chapterMatch = detectChapter(line);
        if (chapterMatch) {
          currentChapter = {
            type: 'chapter' as const,
            level: 1,
            title: chapterMatch.title,
            number: chapterMatch.number,
            startLine: lineIndex,
            startPosition: getPositionFromLine(text, lineIndex),
            sections: [],
          };
          structure.chapters.push(currentChapter);
          structure.hierarchy.push(currentChapter);
          currentSection = null;
        }
      }

      // Detect lists
      const listMatch = detectList(line);
      if (listMatch) {
        structure.lists.push({
          type: 'list',
          content: listMatch.content,
          listType: listMatch.type,
          startLine: lineIndex,
          startPosition: getPositionFromLine(text, lineIndex),
          parentSection: currentSection?.title,
          parentChapter: currentChapter?.title,
        });
      }

      // Detect tables
      if (isTableLine(line)) {
        structure.tables.push({
          type: 'table',
          startLine: lineIndex,
          startPosition: getPositionFromLine(text, lineIndex),
          parentSection: currentSection?.title,
          parentChapter: currentChapter?.title,
        });
      }

      // Detect page breaks
      if (isPageBreak(line)) {
        structure.pageBreaks.push({
          type: 'pageBreak',
          startLine: lineIndex,
          startPosition: getPositionFromLine(text, lineIndex),
        });
      }

      lineIndex++;
    }

    return enhanceStructure(structure, text);
  }

  /**
   * Find semantic boundaries for chunking
   */
  findSemanticBoundaries(text: string, structure: DocumentStructure): SemanticBoundary[] {
    return findSemanticBoundaries(text, structure);
  }
}
