/**
 * Content Type Detection and Markdown Structure Analysis
 * Detects content types, markdown structure, and German language patterns
 */

import type { ContentType, HeaderInfo, MarkdownStructure, GermanPatterns } from './types.js';

export class ContentDetector {
  /**
   * Detect high-level content type from a text block
   * Returns: heading | paragraph | list | code | table
   */
  detectContentType(text: string): ContentType {
    const t = (text || '').trim();
    if (!t) return 'paragraph';

    // Fenced code blocks or typical code patterns
    if (
      /^\s*```/.test(t) ||
      /;\s*$/.test(t) ||
      /{\s*$/.test(t) ||
      /\bfunction\b|=>|const\s+|let\s+|var\s+/.test(t)
    ) {
      return 'code';
    }

    // Markdown header
    if (/^\s{0,3}#{1,6}\s+/.test(t)) return 'heading';

    // List (at least one bullet line)
    const listLines = t.split(/\r?\n/).filter((l) => /^\s*[-*•]\s+/.test(l));
    if (listLines.length >= 1) return 'list';

    // Simple table detection via pipe and header separator
    const hasPipes = /\|/.test(t);
    const hasTableLine = /\n\s*\|?\s*-{2,}\s*\|/.test(t);
    if (hasPipes && (hasTableLine || (t.match(/\|/g) || []).length >= 4)) return 'table';

    return 'paragraph';
  }

  /**
   * Extract header level from a header line (1-6), else null
   */
  extractHeaderLevel(text: string): number | null {
    const m = (text || '').match(/^\s*(#{1,6})\s+.+/);
    if (m) return Math.min(6, Math.max(1, m[1].length));
    return null;
  }

  /**
   * Extract markdown structure features
   */
  detectMarkdownStructure(text: string): MarkdownStructure {
    const t = (text || '').replace(/\r/g, '');
    const lines = t.split(/\n/);
    const headers: HeaderInfo[] = [];
    let lists = 0;
    let tables = 0;
    let codeBlocks = 0;
    let inFence = false;
    let blockquotes = false;

    for (const raw of lines) {
      const line = raw || '';

      // Code fence detection
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        if (inFence) codeBlocks += 1;
      }

      // Header detection
      const level = this.extractHeaderLevel(line);
      if (level) {
        headers.push({ level, text: line.replace(/^\s*#{1,6}\s+/, '').trim() });
      }

      // List detection
      if (/^\s*[-*•]\s+/.test(line)) lists += 1;

      // Table detection
      if (/\|/.test(line)) tables += 1;

      // Blockquote detection
      if (/^\s*>\s+/.test(line)) blockquotes = true;
    }

    // Normalize tables to block-count, not line-count
    if (tables > 0) {
      const blocks = t.split(/\n\s*\n/).filter((b) => /\|/.test(b));
      tables = blocks.length;
    }

    return { headers, lists, codeBlocks, tables, blockquotes };
  }

  /**
   * Extract page number from textual markers like "## Seite X" or "Seite 12"
   */
  extractPageNumber(text: string): number | null {
    const m = (text || '').match(/(?:^|\n)\s*(?:##\s*)?Seite\s+(\d{1,5})\b/i);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Detect German-specific indicators in text
   */
  detectGermanPatterns(text: string): GermanPatterns {
    const t = text || '';

    const hasUmlauts = /[äöüÄÖÜß]/.test(t);
    const hasSectionSymbol = /§/.test(t);
    const germanQuotes = /[„"‚'»«]/.test(t);
    const months =
      /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i.test(t);

    return { hasUmlauts, hasSectionSymbol, germanQuotes, months };
  }
}

// Export singleton instance
export const contentDetector = new ContentDetector();

// Export named functions for backward compatibility
export const detectContentType = (text: string) => contentDetector.detectContentType(text);

export const detectMarkdownStructure = (text: string) => contentDetector.detectMarkdownStructure(text);

export const extractHeaderLevel = (text: string) => contentDetector.extractHeaderLevel(text);

export const extractPageNumber = (text: string) => contentDetector.extractPageNumber(text);

export const detectGermanPatterns = (text: string) => contentDetector.detectGermanPatterns(text);
