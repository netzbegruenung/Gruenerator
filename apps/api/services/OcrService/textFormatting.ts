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
      const headingText = trimmedLine.replace(/^\d+\.\s*/, ''); // Remove leading numbers
      formattedLines.push(`${'#'.repeat(level)} ${headingText}`);
    } else {
      formattedLines.push(line);
    }
  }

  // Clean up excessive newlines (max 2 consecutive)
  let result = formattedLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Check if line is likely a heading
 */
export function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();

  // Empty lines are not headings
  if (!trimmed) return false;

  // ALL CAPS lines shorter than 60 characters
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 60) {
    // Exclude lines that are likely acronyms or codes
    if (!/^[A-Z]{2,5}$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
      return true;
    }
  }

  // Lines ending with colon (typically section headers)
  if (trimmed.endsWith(':') && trimmed.length < 80) {
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
export function determineHeadingLevel(
  line: string,
  index: number,
  allLines: string[]
): number {
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
