/**
 * Text content resolution utilities for chat components
 */

/**
 * Resolves text content from various content object structures
 * @param {*} content - Content object or string
 * @returns {string} - Resolved text content
 */
export const resolveTextContent = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content.text === 'string') return content.text;
  if (typeof content.content === 'string') return content.content;
  if (content.social?.content && typeof content.social.content === 'string') {
    return content.social.content;
  }
  if (Array.isArray(content.lines)) {
    return content.lines.filter(Boolean).join('\n');
  }
  return '';
};
