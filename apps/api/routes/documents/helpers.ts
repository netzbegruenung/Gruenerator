/**
 * Shared helper functions for document routes
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('documents:helpers');

/**
 * Safely parse document metadata that may be an object (from PostgreSQL JSONB)
 * or a string (from serialization)
 */
export function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {};

  // Already an object (from PostgreSQL JSONB)
  if (typeof metadata === 'object' && metadata !== null) {
    return metadata as Record<string, unknown>;
  }

  // String that needs parsing
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch (e) {
      log.warn('Failed to parse document metadata:', e);
      return {};
    }
  }

  return {};
}

/**
 * Generate a short, sentence-aware content preview
 * Extracted from original documents.mjs lines 46-54
 */
export function generateContentPreview(text: string, limit: number = 600): string {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const sentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (sentenceEnd > limit * 0.5) {
    return truncated.slice(0, sentenceEnd + 1);
  }

  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > limit * 0.6 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
}

/**
 * Format file size in human-readable format
 * Extracted from original documents.mjs lines 1280-1286
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface DocumentWithMetadata {
  id: string;
  metadata?: unknown;
  full_content?: string | null;
  [key: string]: unknown;
}

/**
 * Enrich document with content preview from multiple sources
 * Consolidates enrichment logic used throughout the original file
 */
export function enrichDocumentWithPreview(
  doc: DocumentWithMetadata,
  firstChunks: Record<string, string> = {}
): DocumentWithMetadata & { content_preview: string | null; full_content: string | null } {
  const meta = parseMetadata(doc.metadata);
  const metaPreview = typeof meta.content_preview === 'string' ? meta.content_preview : null;
  const metaFullText = typeof meta.full_text === 'string' ? meta.full_text : null;

  // Try multiple sources for content preview
  const preview =
    metaPreview ||
    (metaFullText ? generateContentPreview(metaFullText) : null) ||
    (firstChunks[doc.id] ? generateContentPreview(firstChunks[doc.id]) : null);

  return {
    ...doc,
    content_preview: preview,
    full_content: metaFullText || doc.full_content || null,
  };
}
