/**
 * Text Cleaning Utilities
 * Functions for preparing text for embeddings and search
 */

import { SOFT_HYPHEN, GERMAN_CHARS } from './constants.js';

/**
 * Remove markdown image syntax from text
 * Removes: ![alt](url), reference-style images, HTML <img> tags
 */
export function removeMarkdownImages(text: string): string {
  if (!text) return '';

  let out = text;

  // Remove markdown image syntax ![alt](url)
  out = out.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // Remove reference-style image lines: [id]: url.ext "title"
  out = out.replace(/^\s*\[[^\]]+\]:\s*\S+\.(png|jpe?g|gif|webp|svg)\b.*$/gim, '');

  // Remove HTML <img ...>
  out = out.replace(/<img\b[^>]*>/gi, '');

  // Remove bare image-only lines (e.g., img-0.jpeg markdown from OCR)
  out = out.replace(/^\s*!\[[^\]]*\]\([^)]+\)\s*$/gim, '');

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
 * - Removes null bytes and leading whitespace after newlines
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

  // Remove null bytes (break Postgres text columns)
  out = out.replace(/\0/g, '');

  // Remove leading whitespace after newlines (OCR indentation artifacts)
  out = out.replace(/\n[ \t]+/g, '\n');

  // Remove soft hyphens
  out = out.replace(new RegExp(SOFT_HYPHEN, 'g'), '');

  // Dehyphenate across line breaks: word-\nword -> wordword
  const dehyphenatePattern = new RegExp(
    `([${GERMAN_CHARS}])\\-\\s*\\n\\s*([${GERMAN_CHARS}])`,
    'g'
  );
  out = out.replace(dehyphenatePattern, '$1$2');

  // Join split words caused by OCR spacing inside a word: "No  vember" -> "November".
  // Restricted to intra-line whitespace (`[^\S\n]` = whitespace minus `\n`) —
  // `\s{2,}` also matched a paragraph break like `\n\n` (e.g. between two
  // block elements, #3573), which re-glued words across block boundaries that
  // the extractor had deliberately separated ("wir fordern" + "die stadt" ->
  // "forderndie"). The OCR letter-spacing case this rule targets never spans
  // a line break, so excluding `\n` from the run doesn't affect it.
  // Only on lines with a single wide gap: justified text-layer PDFs space
  // every word of a line ("denn   Klimaschutz   muss   endlich", #3570), and
  // joining there glued real words. An OCR split is an isolated gap.
  // A justified line gets single spaces instead — the structured collapse
  // below only catches runs of 3+.
  out = out
    .split('\n')
    .map((line) =>
      (line.trim().match(/[^\S\n]{2,}/g) ?? []).length > 1
        ? line.replace(/(\S)[^\S\n]{2,}(?=\S)/g, '$1 ')
        : line.replace(/([a-zäöüß])[^\S\n]{2,}([a-zäöüß])/g, '$1$2')
    )
    .join('\n');

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
