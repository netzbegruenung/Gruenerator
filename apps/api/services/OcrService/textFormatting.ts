/**
 * Text formatting utilities for OCR output
 * Applies markdown formatting to plain text and detects headings
 */

/**
 * Apply markdown formatting to plain text
 * Detects headings and adds markdown syntax
 */
export function applyMarkdownFormatting(text: string): string {
  const lines = text.split('\n');
  const formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      formattedLines.push('');
      continue;
    }

    // Check if line is a heading
    if (isLikelyHeading(trimmedLine)) {
      const level = determineHeadingLevel(trimmedLine, i, lines);
      // Keep leading numbers: "9. September 2026", "19. Wahlperiode" carry content (#4123)
      formattedLines.push(`${'#'.repeat(level)} ${trimmedLine}`);
    } else {
      formattedLines.push(line);
    }
  }

  // Clean up excessive newlines (max 2 consecutive)
  let result = formattedLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/** Bullet (`- `, `• `, `* `…) or enumerator (`(2) `, `a) `, `iv) `) at the start of a line. */
const LIST_MARKER = /^(?:[-–—•*·▪●◦]\s|\(?[\p{L}\d]{1,4}\)\s)/u;

/**
 * A full stop after an all-lowercase word, then a capital: `vereinheitlicht. Demnach`.
 * Abbreviations in speaker lines (`Dr. Anton`, `Prof. Dr.`) start upper case and pass.
 */
const SENTENCE_BREAK = /(?:^|\s)\p{Ll}{3,}[.!?]\s+\p{Lu}/u;

/**
 * Check if line is likely a heading
 */
export function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();

  // Empty lines are not headings
  if (!trimmed) return false;

  // List items stay list items, even in upper case or ending in a colon:
  // `- "GRÜNE"`, `(2) Die KMV entscheidet:`, `a) …` (#6142)
  if (LIST_MARKER.test(trimmed)) return false;

  // ALL CAPS lines shorter than 60 characters
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 60) {
    // Exclude lines that are likely acronyms or codes
    if (!/^[A-Z]{2,5}$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
      return true;
    }
  }

  // Lines ending with colon (typically section headers)
  // A sentence that runs on into the colon is prose introducing a list, not a header
  if (trimmed.endsWith(':') && trimmed.length < 80 && !SENTENCE_BREAK.test(trimmed)) {
    return true;
  }

  // Numbered headings (e.g., "1. Introduction", "2.1 Background")
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Determine heading level (H1/H2/H3)
 */
export function determineHeadingLevel(line: string, index: number, _allLines: string[]): number {
  const trimmed = line.trim();

  // H1 criteria: First few lines, short, ALL CAPS
  if (index < 3 && trimmed.length < 50 && trimmed === trimmed.toUpperCase()) {
    return 1;
  }

  // H2 criteria: Shorter headings or numbered main sections
  if (trimmed.length < 40 || /^\d+\.\s+/.test(trimmed)) {
    return 2;
  }

  // H3 for everything else
  return 3;
}
