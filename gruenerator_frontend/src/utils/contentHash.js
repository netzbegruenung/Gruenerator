/**
 * Simple string hashing utility for content duplicate detection
 * Uses a fast non-cryptographic hash for session-based duplicate prevention
 */

/**
 * Creates a hash from string content using the DJB2 algorithm
 * @param {string} str - Content to hash
 * @returns {string} Hash as hexadecimal string
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Strips HTML tags and normalizes whitespace for content comparison
 * @param {string} content - HTML content to normalize
 * @returns {string} Plain text content
 */
function normalizeContent(content) {
  if (!content) return '';

  return content
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Creates a hash for content comparison (includes title for better uniqueness)
 * @param {string} content - HTML content to hash
 * @param {string} [title=''] - Optional title to include in hash
 * @returns {string} Content hash
 */
export function hashContent(content, title = '') {
  const normalizedContent = normalizeContent(content);
  const normalizedTitle = normalizeContent(title);
  const combinedString = `${normalizedTitle}::${normalizedContent}`;

  return djb2Hash(combinedString);
}

/**
 * Checks if two content strings are duplicates
 * @param {string} content1 - First content
 * @param {string} content2 - Second content
 * @param {string} [title1=''] - First title
 * @param {string} [title2=''] - Second title
 * @returns {boolean} True if content is duplicate
 */
export function isDuplicateContent(content1, content2, title1 = '', title2 = '') {
  return hashContent(content1, title1) === hashContent(content2, title2);
}
