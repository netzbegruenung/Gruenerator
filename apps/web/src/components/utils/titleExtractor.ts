/**
 * Utility functions for extracting titles and generating filenames from HTML content
 */

/**
 * Extract a clean title from HTML content (first H2 header)
 * @param content - HTML content to extract from
 * @param fallbackTitle - Fallback title if no H2 found
 * @returns Clean title suitable for display
 */
export const extractTitleFromContent = (
  content: string | null | undefined,
  fallbackTitle = 'Unbenanntes Dokument'
): string => {
  const h2Match = content?.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    const title = h2Match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .trim();

    if (title.length > 0) {
      return title;
    }
  }

  return fallbackTitle;
};

/**
 * Extract filename from content (first H2 header) with sanitization for file systems
 * @param content - HTML content to extract from
 * @param title - Fallback title prop
 * @param fallback - Final fallback if nothing found
 * @returns Sanitized filename (without extension)
 */
export const extractFilenameFromContent = (
  content: string | null | undefined,
  title?: string,
  fallback = 'Dokument'
): string => {
  const cleanTitle = extractTitleFromContent(content, title || fallback);

  if (cleanTitle !== fallback && cleanTitle !== title) {
    return cleanTitle
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 50)
      .replace(/^_+|_+$/g, '');
  }

  return cleanTitle;
};
