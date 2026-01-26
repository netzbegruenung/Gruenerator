/**
 * Detection methods for document structure elements
 * Detects chapters, sections, lists, tables, and page breaks
 */

import { patterns } from './patterns.js';
import type { ChapterMatch, SectionMatch, ListMatch } from './types.js';

/**
 * Detect chapter headings
 */
export function detectChapter(line: string): ChapterMatch | null {
  for (const pattern of patterns.chapter) {
    const match = line.match(pattern);
    if (match) {
      const number = match[1] || match[2] || '';
      const title = (match[3] || match[2] || match[1] || '').trim();

      if (title) {
        return {
          number: number,
          title: title,
        };
      }
    }
  }
  return null;
}

/**
 * Detect section headings
 */
export function detectSection(line: string): SectionMatch | null {
  for (const pattern of patterns.section) {
    const match = line.match(pattern);
    if (match && match[2]) {
      const title = match[2].trim();
      // Filter out false positives (too short, all caps, etc.)
      if (title.length >= 3 && title !== title.toUpperCase()) {
        return {
          number: (match[1] || '').trim(),
          title: title,
        };
      }
    }
  }

  // Check markdown headings
  for (const pattern of patterns.markdown) {
    const match = line.match(pattern);
    if (match && match[2]) {
      return {
        number: match[1].length.toString(), // # count as level
        title: match[2].trim(),
      };
    }
  }

  return null;
}

/**
 * Detect list items
 */
export function detectList(line: string): ListMatch | null {
  for (const pattern of patterns.list) {
    const match = line.match(pattern);
    if (match && match[1]) {
      return {
        content: match[1].trim(),
        type: getListType(line),
      };
    }
  }
  return null;
}

/**
 * Check if line is part of a table
 */
export function isTableLine(line: string): boolean {
  return patterns.table.some((pattern) => pattern.test(line));
}

/**
 * Check if line is a page break
 */
export function isPageBreak(line: string): boolean {
  return patterns.pageBreak.some((pattern) => pattern.test(line));
}

/**
 * Determine list type
 */
export function getListType(line: string): 'ordered' | 'alpha' | 'unordered' {
  if (/^[\s]*\d+[\.\)]/.test(line)) return 'ordered';
  if (/^[\s]*[a-z][\.\)]/.test(line)) return 'alpha';
  return 'unordered';
}

/**
 * Calculate hierarchical level for sections
 */
export function calculateSectionLevel(numberString: string): number {
  if (!numberString) return 2;

  // Count dots to determine depth (1.1 = level 2, 1.1.1 = level 3, etc.)
  const dots = (numberString.match(/\./g) || []).length;
  return Math.min(dots + 2, 6); // Cap at level 6
}

/**
 * Get character position from line number
 */
export function getPositionFromLine(text: string, lineNumber: number): number {
  const lines = text.split('\n');
  let position = 0;
  for (let i = 0; i < lineNumber && i < lines.length; i++) {
    position += lines[i].length + 1; // +1 for newline
  }
  return position;
}
