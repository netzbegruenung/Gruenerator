/**
 * Text Cleaning Utilities
 * Functions for preparing text for embeddings and search
 */

import { SOFT_HYPHEN, GERMAN_CHARS } from './constants.js';
import type { CleaningOptions } from './types.js';

/**
 * Remove markdown image syntax from text
 * Removes: ![alt](url), reference-style images, HTML <img> tags
 */
export function removeMarkdownImages(text: string): string {
  if (!text) return '';

  let out = text;

  // Remove markdown image syntax ![alt](url)
  out = out.replace(/!\[[^\]]*\]\([^\)]+\)/g, '');

  // Remove reference-style image lines: [id]: url.ext "title"
  out = out.replace(/^\s*\[[^\]]+\]:\s*\S+\.(png|jpe?g|gif|webp|svg)\b.*$/gim, '');

  // Remove HTML <img ...>
  out = out.replace(/<img\b[^>]*>/gi, '');

  // Remove bare image-only lines (e.g., img-0.jpeg markdown from OCR)
  out = out.replace(/^\s*!\[[^\]]*\]\([^\)]+\)\s*$/gim, '');

  return out;
}

/**
 * Collapse three or more consecutive blank lines into two
 */
export function collapseBlankLines(text: string): string {
  return (text || '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Clean text for embedding preparation
 * - Removes soft hyphens
 * - Dehyphenates words split across line breaks
 * - Joins OCR-split words
 * - Normalizes whitespace
 * - Removes markdown images
 * - Collapses blank lines
 *
 * @param text - Text to clean
 * @param preserveStructure - If true, preserves page markers and structural elements
 */
export function cleanTextForEmbedding(text: string, preserveStructure = false): string {
  let out = text || '';

  // Remove soft hyphens
  out = out.replace(new RegExp(SOFT_HYPHEN, 'g'), '');

  // Dehyphenate across line breaks: word-\nword -> wordword
  const dehyphenatePattern = new RegExp(
    `([${GERMAN_CHARS}])\\-\\s*\\n\\s*([${GERMAN_CHARS}])`,
    'g'
  );
  out = out.replace(dehyphenatePattern, '$1$2');

  // Join split words caused by OCR spacing inside a word: "No  vember" -> "November"
  out = out.replace(/([a-zäöüß])\s{2,}([a-zäöüß])/g, '$1$2');

  if (!preserveStructure) {
    // Collapse multiple spaces to single
    out = out.replace(/\s{2,}/g, ' ');
  } else {
    // Gentle space normalization that preserves page markers
    const lines = out.split('\n');
    out = lines
      .map((line) => {
        // Preserve page markers exactly
        if (/^##\s*Seite\s+\d+/i.test(line.trim())) {
          return line;
        }
        // For other lines, collapse excessive spaces
        return line.replace(/[ \t]{3,}/g, ' ');
      })
      .join('\n');
  }

  // Remove markdown images
  out = removeMarkdownImages(out);

  if (!preserveStructure) {
    out = collapseBlankLines(out);
  }

  return out;
}
