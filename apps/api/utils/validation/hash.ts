/**
 * Hash utilities for consistent ID generation
 *
 * This is the single source of truth for all hash functions in the codebase.
 * Use these functions instead of creating local implementations.
 */

import * as crypto from 'crypto';

/**
 * Generate a numeric hash from a string using djb2 algorithm
 * Used for generating Qdrant point IDs from string identifiers
 *
 * @alias stringToNumericId - Legacy name, use stringToNumericHash
 */
export function stringToNumericHash(str: string): number {
  if (typeof str !== 'string') {
    throw new TypeError('stringToNumericHash requires a string input');
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Alias for stringToNumericHash - maintained for backward compatibility
 * @deprecated Use stringToNumericHash instead
 */
export const stringToNumericId = stringToNumericHash;

/**
 * Generate MD5 hash for content change detection
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('md5').update(content.trim()).digest('hex');
}

/**
 * Generate a combined point ID for Qdrant from multiple components
 */
export function generatePointId(prefix: string, id: string | number, index: number = 0): number {
  const combined = `${prefix}_${id}_${index}`;
  return stringToNumericHash(combined);
}

/**
 * Generate a numeric ID from document ID and chunk index
 * Combines document identifier with chunk position for unique point IDs
 */
export function chunkToNumericId(documentId: string, index: number): number {
  return stringToNumericHash(`${documentId}_${index}`);
}

/**
 * Simple hash for cache keys - lighter weight than crypto hashes
 * Returns a hex string suitable for cache key suffixes
 */
export function simpleHash(str: string): string {
  const hash = stringToNumericHash(str);
  return hash.toString(16);
}

export default {
  stringToNumericHash,
  stringToNumericId,
  generateContentHash,
  generatePointId,
  chunkToNumericId,
  simpleHash,
};
