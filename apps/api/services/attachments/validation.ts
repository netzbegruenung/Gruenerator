/**
 * Validation utilities for attachment processing
 */

import { ALLOWED_ATTACHMENT_TYPES, MAX_FILE_SIZE } from './constants.js';

import type { Attachment, FileAttachment, CrawledUrlAttachment } from './types.js';

/**
 * Type guard: Check if attachment is a file attachment
 */
export function isFileAttachment(attachment: Attachment): attachment is FileAttachment {
  return attachment.type !== 'crawled_url';
}

/**
 * Type guard: Check if attachment is a crawled URL
 */
export function isCrawledUrlAttachment(attachment: Attachment): attachment is CrawledUrlAttachment {
  return attachment.type === 'crawled_url';
}

/**
 * Extract base64 from data URL or return raw base64
 * Handles both "data:image/png;base64,..." and raw base64 strings
 */
export function extractBase64FromDataUrl(data: string): string {
  if (data.startsWith('data:')) {
    const match = data.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URL format');
    }
    return match[1];
  }
  return data;
}

/**
 * Validate single attachment structure
 * Throws error if validation fails
 */
export function validateAttachmentStructure(
  attachment: unknown,
  index: number
): asserts attachment is Attachment {
  if (!attachment || typeof attachment !== 'object') {
    throw new Error(`Attachment ${index + 1}: Must be an object`);
  }
  const att = attachment as Record<string, unknown>;
  // Check required fields
  if (!att.name || typeof att.name !== 'string') {
    throw new Error(`Attachment ${index + 1}: Missing or invalid name`);
  }

  if (!att.type || typeof att.type !== 'string') {
    throw new Error(`Attachment ${index + 1}: Missing or invalid type`);
  }

  if (!att.data || typeof att.data !== 'string') {
    throw new Error(`Attachment ${index + 1}: Missing or invalid data`);
  }

  if (typeof att.size !== 'number' || att.size <= 0) {
    throw new Error(`Attachment ${index + 1}: Missing or invalid size`);
  }

  // Validate attachment type
  if (!ALLOWED_ATTACHMENT_TYPES.includes(att.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
    throw new Error(
      `Attachment ${index + 1}: Unsupported file type '${String(att.type)}'. Allowed: ${ALLOWED_ATTACHMENT_TYPES.join(', ')}`
    );
  }

  // Handle different validation for crawled URLs vs files
  if (att.type === 'crawled_url') {
    // Crawled URLs have content instead of base64 data
    if (!att.content || typeof att.content !== 'string') {
      throw new Error(`Attachment ${index + 1}: Missing or invalid content for crawled URL`);
    }

    if (!att.url || typeof att.url !== 'string') {
      throw new Error(`Attachment ${index + 1}: Missing or invalid URL for crawled URL`);
    }

    // Use content length as size for crawled URLs
    const contentSize = (att.content as string).length;
    if (contentSize > MAX_FILE_SIZE) {
      const sizeMB = Math.round(contentSize / (1024 * 1024));
      const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      throw new Error(
        `Attachment ${index + 1}: Crawled content too large (${sizeMB}MB). Maximum: ${maxSizeMB}MB`
      );
    }
  } else {
    // Regular file validation
    if ((att.size as number) > MAX_FILE_SIZE) {
      const sizeMB = Math.round((att.size as number) / (1024 * 1024));
      const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      throw new Error(
        `Attachment ${index + 1}: File too large (${sizeMB}MB). Maximum: ${maxSizeMB}MB`
      );
    }

    // Validate base64 data format
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(att.data as string)) {
      throw new Error(`Attachment ${index + 1}: Invalid base64 data format`);
    }
  }
}
