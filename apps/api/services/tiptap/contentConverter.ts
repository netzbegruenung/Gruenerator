/**
 * Content Converter for Grünerator Docs Export
 *
 * Simplified approach: Store HTML content in the database and let the
 * TipTap collaborative editor in the frontend initialize the Y.js document
 * from HTML when the user first opens the document.
 *
 * This avoids adding TipTap dependencies to the backend and leverages
 * the existing frontend editor infrastructure.
 */

import { stripHtmlTags } from '@gruenerator/shared/utils';

const MAX_HTML_LENGTH = 1024 * 1024;

/**
 * Validates and sanitizes HTML content for storage
 * @param html - HTML string to validate
 * @returns Sanitized HTML string
 */
export function validateAndSanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    throw new Error('HTML content must be a non-empty string');
  }

  const trimmed = html.trim();
  if (trimmed.length === 0) {
    throw new Error('HTML content cannot be empty');
  }

  const sizeInBytes = new Blob([trimmed]).size;
  const maxSizeBytes = 1 * 1024 * 1024;
  if (sizeInBytes > maxSizeBytes) {
    throw new Error(`Content too large: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB (max 1MB)`);
  }

  return trimmed;
}

/**
 * Extracts a title from HTML content (first heading or first 50 chars)
 * @param html - HTML content
 * @returns Extracted title
 */
export function extractTitleFromHtml(html: string): string {
  if (html.length > MAX_HTML_LENGTH) {
    html = html.slice(0, MAX_HTML_LENGTH);
  }
  const headingMatch = html.match(/<h[1-6][^>]{0,100}>([\s\S]{0,500}?)<\/h[1-6]>/i);
  if (headingMatch && headingMatch[1]) {
    const title = stripHtmlTags(headingMatch[1]);
    if (title.length > 0) {
      return title.length > 100 ? title.substring(0, 97) + '...' : title;
    }
  }

  const textContent = stripHtmlTags(html);
  if (textContent.length > 0) {
    return textContent.length > 50 ? textContent.substring(0, 47) + '...' : textContent;
  }

  return 'Untitled Document';
}

// Re-export shared utility for backwards compatibility
export { stripHtmlTags } from '@gruenerator/shared/utils';
