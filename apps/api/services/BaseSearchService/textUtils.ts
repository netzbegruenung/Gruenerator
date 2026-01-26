/**
 * Text Utilities for Search Services
 *
 * Functions for text processing, excerpt extraction, highlighting,
 * and table of contents detection.
 */

/**
 * Detect if text looks like a table of contents
 * TOC entries typically have dot leaders and page numbers
 */
export function looksLikeTOC(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();

  // Check for explicit TOC heading
  if (/inhaltsverzeichnis/i.test(t)) return true;

  // Check for dot leaders followed by page numbers
  if (/\.\.{2,}\s*\d{1,4}\b/.test(t)) return true;

  // Check for many short lines with numbers (typical TOC pattern)
  const lines = t.split(/\n/);
  const shortLines = lines.filter((l) => l.trim().length > 0 && l.trim().length <= 60);
  const digits = (t.match(/\d/g) || []).length;
  if (shortLines.length >= 2 && digits >= 6) return true;

  return false;
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight a search term in text using markdown bold
 */
export function highlightTerm(
  text: string | null | undefined,
  term: string | null | undefined
): string {
  if (!text || !term) return text || '';
  try {
    const re = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    return text.replace(re, '**$1**');
  } catch {
    return text;
  }
}

/**
 * Find sentence boundary near a position in text
 * @param text - The full text
 * @param position - Current position in text
 * @param direction - 'start' to find boundary before, 'end' to find after
 * @param maxSearch - Maximum characters to search
 * @returns Adjusted position at sentence boundary
 */
export function trimToSentenceBoundary(
  text: string | null | undefined,
  position: number,
  direction: 'start' | 'end' = 'start',
  maxSearch = 150
): number {
  if (!text || position < 0 || position >= text.length) return position;
  const sentenceEnders = /[.!?]/;

  if (direction === 'start') {
    // Look backwards for sentence boundary
    const searchStart = Math.max(0, position - maxSearch);
    let lastSentenceEnd = -1;

    for (let i = searchStart; i < position; i++) {
      if (sentenceEnders.test(text[i])) {
        lastSentenceEnd = i;
      }
    }

    if (lastSentenceEnd !== -1) {
      let newPos = lastSentenceEnd + 1;
      // Skip whitespace after sentence end
      while (newPos < text.length && /\s/.test(text[newPos])) {
        newPos++;
      }
      return newPos;
    }

    // No sentence boundary found - find word boundary
    while (position < text.length && !/\s/.test(text[position])) {
      position++;
    }
    while (position < text.length && /\s/.test(text[position])) {
      position++;
    }
    return position;
  } else {
    // Look forward for sentence boundary
    const searchEnd = Math.min(text.length, position + maxSearch);

    for (let i = position; i < searchEnd; i++) {
      if (sentenceEnders.test(text[i])) {
        return i + 1;
      }
    }

    // No sentence boundary found - find word boundary backwards
    while (position > 0 && !/\s/.test(text[position - 1])) {
      position--;
    }
    return position;
  }
}

/**
 * Check if excerpt should have leading ellipsis
 */
export function needsLeadingEllipsis(text: string, start: number): boolean {
  if (start === 0) return false;

  const charBefore = text[start - 1];
  if (/[.!?]/.test(charBefore)) return false;

  const textBefore = text.slice(Math.max(0, start - 3), start).trim();
  if (/[.!?]$/.test(textBefore)) return false;

  return true;
}

/**
 * Check if excerpt should have trailing ellipsis
 */
export function needsTrailingEllipsis(text: string, end: number): boolean {
  if (end >= text.length) return false;

  const lastChar = text[end - 1];
  if (/[.!?]/.test(lastChar)) return false;

  return true;
}

/**
 * Extract an excerpt from text centered around a search term
 * with smart sentence boundaries and highlighting
 *
 * @param text - Full text to excerpt from
 * @param term - Search term to center on (optional)
 * @param maxLen - Maximum excerpt length
 * @returns Formatted excerpt with ellipsis and highlighting
 */
export function extractMatchedExcerpt(
  text: string | null | undefined,
  term: string | null | undefined,
  maxLen = 400
): string {
  if (!text) return '';

  // No term - just get beginning of text
  if (!term) {
    if (text.length <= maxLen) return text;

    let end = trimToSentenceBoundary(text, maxLen, 'end', 100);
    if (end > maxLen * 1.3) end = maxLen;

    const snippet = text.slice(0, end).trim();
    return snippet + (needsTrailingEllipsis(text, end) ? '...' : '');
  }

  // Find term position in text
  const lower = text.toLowerCase();
  const q = term.toLowerCase();
  const idx = lower.indexOf(q);

  // Term not found - return beginning of text
  if (idx === -1) {
    if (text.length <= maxLen) return text;

    let end = trimToSentenceBoundary(text, maxLen, 'end', 100);
    if (end > maxLen * 1.3) end = maxLen;

    const snippet = text.slice(0, end).trim();
    return snippet + (needsTrailingEllipsis(text, end) ? '...' : '');
  }

  // Calculate excerpt window around term
  let start = Math.max(0, idx - Math.floor(maxLen * 0.4));
  let end = Math.min(text.length, idx + Math.floor(maxLen * 0.6));

  // Adjust to sentence boundaries
  if (start > 0) {
    start = trimToSentenceBoundary(text, start, 'start', 120);
  }

  if (end < text.length) {
    end = trimToSentenceBoundary(text, end, 'end', 120);

    // Don't exceed maxLen by too much
    if (end > start + maxLen * 1.4) {
      end = start + maxLen;
      while (end > start && !/\s/.test(text[end - 1])) {
        end--;
      }
    }
  }

  // Build excerpt with ellipsis
  const prefix = needsLeadingEllipsis(text, start) ? '...' : '';
  const suffix = needsTrailingEllipsis(text, end) ? '...' : '';
  const snippet = prefix + text.slice(start, end).trim() + suffix;

  // Highlight the search term
  return highlightTerm(snippet, term);
}

/**
 * Extract simple excerpt from beginning of text
 * with smart truncation at punctuation or word boundaries
 *
 * @param text - Text to excerpt
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function extractSimpleExcerpt(text: string | null | undefined, maxLength = 300): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }

  const truncated = text.substring(0, maxLength);
  const lastPunctuation = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!')
  );

  // Prefer ending at punctuation if it's past 70% of max length
  if (lastPunctuation > maxLength * 0.7) {
    return truncated.substring(0, lastPunctuation + 1);
  }

  return truncated + '...';
}

/**
 * Deduplicate paragraphs in combined chunk text
 *
 * When multiple overlapping chunks are combined (due to 400-char chunk overlap),
 * the same paragraphs may appear multiple times. This function removes duplicates
 * while preserving the natural reading order.
 *
 * The algorithm uses a fingerprint approach:
 * - Normalizes whitespace and compares first 100 chars of each paragraph
 * - Preserves the first occurrence of each paragraph
 * - Handles chunks separated by --- markers
 *
 * @param text - Combined text from multiple chunks (joined with \n\n---\n\n)
 * @param options - Configuration options
 * @returns Deduplicated text with preserved structure
 */
export function deduplicateParagraphs(
  text: string | null | undefined,
  options: { fingerprintLength?: number; preserveSeparators?: boolean } = {}
): string {
  if (!text) return '';

  const { fingerprintLength = 100, preserveSeparators = true } = options;

  // Split into chunk sections (separated by ---)
  const chunks = text.split(/\n*---\n*/);

  // Track seen paragraph fingerprints
  const seenFingerprints = new Set<string>();

  // Process each chunk
  const deduplicatedChunks: string[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    // Split chunk into paragraphs (double newline or single newline for headers)
    const paragraphs = chunk.split(/\n\n+/);
    const uniqueParagraphs: string[] = [];

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      // Create fingerprint: normalize whitespace and take first N chars
      const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
      const fingerprint = normalized.substring(0, fingerprintLength);

      // Skip if we've seen this fingerprint before
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }

      seenFingerprints.add(fingerprint);
      uniqueParagraphs.push(trimmed);
    }

    if (uniqueParagraphs.length > 0) {
      deduplicatedChunks.push(uniqueParagraphs.join('\n\n'));
    }
  }

  // Rejoin chunks with separators
  if (preserveSeparators && deduplicatedChunks.length > 1) {
    return deduplicatedChunks.join('\n\n---\n\n');
  }

  return deduplicatedChunks.join('\n\n');
}

/**
 * Deduplicate paragraphs across an array of chunk texts
 *
 * Similar to deduplicateParagraphs but works on individual chunks before combining.
 * Useful when you have separate chunk objects and want to combine them without duplicates.
 *
 * @param chunks - Array of chunk text strings
 * @param options - Configuration options
 * @returns Combined, deduplicated text
 */
export function deduplicateChunkTexts(
  chunks: (string | null | undefined)[],
  options: { fingerprintLength?: number; separator?: string } = {}
): string {
  if (!chunks || chunks.length === 0) return '';

  const { fingerprintLength = 100, separator = '\n\n---\n\n' } = options;

  const seenFingerprints = new Set<string>();
  const uniqueTexts: string[] = [];

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;

    // Split into paragraphs
    const paragraphs = chunk.split(/\n\n+/);
    const uniqueParagraphs: string[] = [];

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      // Create fingerprint
      const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
      const fingerprint = normalized.substring(0, fingerprintLength);

      if (seenFingerprints.has(fingerprint)) {
        continue;
      }

      seenFingerprints.add(fingerprint);
      uniqueParagraphs.push(trimmed);
    }

    if (uniqueParagraphs.length > 0) {
      uniqueTexts.push(uniqueParagraphs.join('\n\n'));
    }
  }

  return uniqueTexts.join(separator);
}
