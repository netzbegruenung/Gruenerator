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

/**
 * Short German date (TT.MM.JJJJ) from an ISO string or Date; `unbekannt` when
 * unparseable. Shared by the past-chat recall block and the content rows of the
 * chat tools (#5140).
 */
export function formatShortGermanDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/**
 * Format a date in long German style (e.g. "Sonntag, 9. Mai 2026").
 * Used in composer prompts so the model can date-stamp generated content.
 * @example formatGermanDate() -> "Sonntag, 9. Mai 2026"
 */
export function formatGermanDate(date: Date = new Date()): string {
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
