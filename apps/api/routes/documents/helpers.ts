/**
 * Shared helper functions for document routes
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('documents:helpers');

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
  return lastSpace > limit * 0.6
    ? `${truncated.slice(0, lastSpace)}...`
    : `${truncated}...`;
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

/**
 * Enrich document with content preview from multiple sources
 * Consolidates enrichment logic used throughout the original file
 */
export function enrichDocumentWithPreview(
  doc: any,
  firstChunks: Record<string, string> = {}
): any {
  let meta: Record<string, any> = {};
  try {
    meta = doc.metadata ? JSON.parse(doc.metadata) : {};
  } catch (e) {
    log.warn('Failed to parse document metadata:', e);
    meta = {};
  }

  // Try multiple sources for content preview
  const preview = meta.content_preview ||
                 (meta.full_text ? generateContentPreview(meta.full_text) : null) ||
                 (firstChunks[doc.id] ? generateContentPreview(firstChunks[doc.id]) : null);

  return {
    ...doc,
    content_preview: preview,
    full_content: meta.full_text || doc.full_content || null,
  };
}
