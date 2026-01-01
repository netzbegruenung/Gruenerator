/**
 * Deduplication utilities for scrapers
 * Content hashing and duplicate detection
 */

import crypto from 'crypto';

/**
 * Generate SHA-256 hash of content
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Generate hash from multiple fields
 */
export function generateCompositeHash(...fields: string[]): string {
  const combined = fields.join('|');
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

/**
 * Normalize text for comparison (remove extra whitespace, lowercase)
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two texts are similar (simple Jaccard similarity)
 */
export function areSimilar(text1: string, text2: string, threshold: number = 0.8): boolean {
  const words1 = new Set(normalizeForComparison(text1).split(' '));
  const words2 = new Set(normalizeForComparison(text2).split(' '));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  const similarity = intersection.size / union.size;
  return similarity >= threshold;
}

/**
 * Deduplicate array of items by hash function
 */
export function deduplicateBy<T>(items: T[], hashFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const hash = hashFn(item);
    if (seen.has(hash)) {
      return false;
    }
    seen.add(hash);
    return true;
  });
}
