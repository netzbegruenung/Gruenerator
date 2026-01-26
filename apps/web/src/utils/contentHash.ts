/**
 * Simple string hashing utility for content duplicate detection
 * Uses a fast non-cryptographic hash for session-based duplicate prevention
 */

/**
 * Creates a hash from string content using the DJB2 algorithm
 * @param str - Content to hash
 * @returns Hash as hexadecimal string
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Strips HTML tags and normalizes whitespace for content comparison
 * @param content - HTML content to normalize
 * @returns Plain text content
 */
function normalizeContent(content: string | null | undefined): string {
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
 * @param content - HTML content to hash
 * @param title - Optional title to include in hash
 * @returns Content hash
 */
export function hashContent(content: string | null | undefined, title = ''): string {
  const normalizedContent = normalizeContent(content);
  const normalizedTitle = normalizeContent(title);
  const combinedString = `${normalizedTitle}::${normalizedContent}`;

  return djb2Hash(combinedString);
}

/**
 * Checks if two content strings are duplicates
 * @param content1 - First content
 * @param content2 - Second content
 * @param title1 - First title
 * @param title2 - Second title
 * @returns True if content is duplicate
 */
export function isDuplicateContent(
  content1: string | null | undefined,
  content2: string | null | undefined,
  title1 = '',
  title2 = ''
): boolean {
  return hashContent(content1, title1) === hashContent(content2, title2);
}
