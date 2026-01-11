/**
 * Create clean text previews from HTML content
 * Strips tags, removes extra whitespace, and truncates
 */

/**
 * Strip all HTML tags from a string
 */
function stripHtmlTags(html: string): string {
  // Create a temporary DOM element
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Get text content
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Remove excessive whitespace and normalize line breaks
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n+/g, '\n') // Replace multiple line breaks with single line break
    .trim();
}

/**
 * Create a text preview from HTML content
 * @param htmlContent - HTML string to create preview from
 * @param maxLength - Maximum character length (default: 150)
 * @returns Clean preview text
 */
export function createTextPreview(htmlContent: string, maxLength: number = 150): string {
  if (!htmlContent || htmlContent.trim().length === 0) {
    return '';
  }

  // Strip HTML tags
  let preview = stripHtmlTags(htmlContent);

  // Normalize whitespace
  preview = normalizeWhitespace(preview);

  // Truncate if needed
  if (preview.length > maxLength) {
    // Try to cut at word boundary
    const truncated = preview.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      // If we're close enough to the end, cut at word boundary
      preview = truncated.substring(0, lastSpace) + '...';
    } else {
      // Otherwise just hard cut
      preview = truncated + '...';
    }
  }

  return preview;
}

/**
 * Create a multi-line preview (for cards)
 * @param htmlContent - HTML string to create preview from
 * @param maxLines - Maximum number of lines (default: 3)
 * @param maxCharsPerLine - Max characters per line (default: 60)
 * @returns Preview text with line breaks
 */
export function createMultiLinePreview(
  htmlContent: string,
  maxLines: number = 3,
  maxCharsPerLine: number = 60
): string {
  if (!htmlContent || htmlContent.trim().length === 0) {
    return '';
  }

  // Strip HTML and normalize
  let text = stripHtmlTags(htmlContent);
  text = normalizeWhitespace(text);

  // Split into words
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (lines.length >= maxLines) {
      break;
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is longer than max chars per line
        lines.push(word.substring(0, maxCharsPerLine));
        currentLine = '';
      }
    } else {
      currentLine = testLine;
    }
  }

  // Add remaining line
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // Join with line breaks and add ellipsis if truncated
  let preview = lines.join('\n');
  if (words.length > lines.join(' ').split(' ').length) {
    preview += '...';
  }

  return preview;
}

/**
 * Extract first N words from HTML content
 * @param htmlContent - HTML string
 * @param wordCount - Number of words to extract (default: 20)
 * @returns First N words as plain text
 */
export function extractFirstWords(htmlContent: string, wordCount: number = 20): string {
  if (!htmlContent || htmlContent.trim().length === 0) {
    return '';
  }

  const text = stripHtmlTags(htmlContent);
  const words = normalizeWhitespace(text).split(' ');

  if (words.length <= wordCount) {
    return words.join(' ');
  }

  return words.slice(0, wordCount).join(' ') + '...';
}
