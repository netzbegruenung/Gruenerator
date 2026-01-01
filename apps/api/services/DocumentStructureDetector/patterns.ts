/**
 * German Document Pattern Definitions
 * Regex patterns for detecting document structure elements
 */

import type { PatternCollection } from './types.js';

/**
 * Pattern collection for German document structure detection
 */
export const patterns: PatternCollection = {
  // Chapter patterns - more restrictive to avoid matching sections
  chapter: [
    /^(Kapitel|Chapter|Teil|Abschnitt)\s+([IVXLC]+|\d+)[\.:]\s*(.+)$/im,
    /^([IVXLC]+|\d+)[\.:]\s+(Kapitel|Chapter|Teil|Abschnitt)[\.:]\s*(.+)$/im,
    /^(Kapitel|Chapter|Teil|Abschnitt)\s+(\d+):\s*(.+)$/im,
    /^([IVXLC]+)[\.:]\s*([A-ZÄÖÜ][^.]*[^0-9])$/im, // Roman numerals with non-numbered titles
    /^(\d+)[\.:]\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s]{10,50}[^0-9])$/im // Single digit with longer titles, no numbers at end
  ],

  // Section patterns (numbered)
  section: [
    /^(\d+(?:\.\d+)*)\s+(.+)$/m,
    /^([A-Z][\.:]\s*|\d+[\.:]\s*)(.+)$/m,
    /^(\d+\.\d+\.\d+)\s+(.+)$/m, // 1.1.1 format
    /^##\s+(.+)$/m, // Markdown H2
    /^###\s+(.+)$/m, // Markdown H3
    /^####\s+(.+)$/m // Markdown H4
  ],

  // Subsection patterns
  subsection: [
    /^(\d+\.\d+(?:\.\d+)*[\.:]*)\s+(.+)$/gm,
    /^([a-z]\)|[a-z][\.:]\s*)(.+)$/gm
  ],

  // Markdown headings
  markdown: [
    /^(#{1,6})\s+(.+)$/gm
  ],

  // List patterns
  list: [
    /^[\s]*[•\-\*]\s+(.+)$/m,
    /^[\s]*\d+[\.\)]\s+(.+)$/m,
    /^[\s]*[a-z][\.\)]\s+(.+)$/m
  ],

  // Table patterns
  table: [
    /^\|.+\|$/m,
    /^.+\t.+$/m,
    /^.+\s+\|\s+.+$/m // "Column | Column" format
  ],

  // Page break patterns
  pageBreak: [
    /^[\s]*[-=]{3,}[\s]*$/gm,
    /^\f/gm, // Form feed character
    /Seite\s+\d+/gim
  ]
};
