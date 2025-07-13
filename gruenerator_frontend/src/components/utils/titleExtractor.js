/**
 * Utility functions for extracting titles and generating filenames from HTML content
 */

/**
 * Extract a clean title from HTML content (first H2 header)
 * @param {string} content - HTML content to extract from
 * @param {string} fallbackTitle - Fallback title if no H2 found
 * @returns {string} - Clean title suitable for display
 */
export const extractTitleFromContent = (content, fallbackTitle = 'Unbenanntes Dokument') => {
  // Try to extract first H2 header
  const h2Match = content?.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    let title = h2Match[1]
      .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
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
  
  // Fallback to provided title or default
  return fallbackTitle;
};

/**
 * Extract filename from content (first H2 header) with sanitization for file systems
 * @param {string} content - HTML content to extract from
 * @param {string} title - Fallback title prop
 * @param {string} fallback - Final fallback if nothing found
 * @returns {string} - Sanitized filename (without extension)
 */
export const extractFilenameFromContent = (content, title, fallback = 'Dokument') => {
  // First try to get clean title
  const cleanTitle = extractTitleFromContent(content, title || fallback);
  
  // If we got a clean title that's not the fallback, sanitize it for filename
  if (cleanTitle !== fallback && cleanTitle !== title) {
    return cleanTitle
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50) // Limit length
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  }
  
  // Return the clean title as-is (fallback cases)
  return cleanTitle;
};