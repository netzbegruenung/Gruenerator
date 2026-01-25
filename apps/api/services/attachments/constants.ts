/**
 * Configuration constants for attachment processing
 */

/**
 * Allowed MIME types for file attachments
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/**
 * Allowed attachment types (including special types like crawled URLs)
 */
export const ALLOWED_ATTACHMENT_TYPES = [...ALLOWED_MIME_TYPES, 'crawled_url'] as const;

/**
 * Maximum size for a single file attachment (5MB)
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Maximum total size for all attachments (30MB)
 * Claude API has 32MB limit, leaving buffer
 */
export const MAX_TOTAL_SIZE = 30 * 1024 * 1024;

/**
 * Maximum size for image attachments (10MB)
 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * MIME type to file extension mapping
 */
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
