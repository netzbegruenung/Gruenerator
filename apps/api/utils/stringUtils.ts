/**
 * String Utility Functions
 * Common string manipulation helpers for sanitization and formatting
 */

/**
 * Generate a sanitized technical name from a label
 * Converts to lowercase, replaces spaces with underscores, removes special chars
 * @example "User Name" -> "user_name"
 */
export function generateSanitizedName(label: string): string {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Sanitize a string to be URL-friendly slug
 * Converts to lowercase, replaces spaces with hyphens, removes special chars
 * @example "My Cool Page" -> "my-cool-page"
 */
export function sanitizeSlug(slug: string): string {
  if (!slug) return '';
  return slug
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
