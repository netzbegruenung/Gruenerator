/**
 * Search Formatting Utilities
 *
 * Pure utility functions for formatting, truncating, and deduplicating
 * search results. Shared across direct search executors and the research
 * orchestrator.
 */

/**
 * Extract domain from URL.
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Format a relevance score as a human-readable string.
 */
export function formatRelevance(score: number): string {
  if (score >= 0.8) return 'Sehr hoch';
  if (score >= 0.6) return 'Hoch';
  if (score >= 0.4) return 'Mittel';
  if (score >= 0.2) return 'Niedrig';
  return 'Gering';
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

/**
 * Deduplicate items by URL. Items without a URL are always kept.
 *
 * @param items - Array of items to deduplicate
 * @param getUrl - Accessor function to extract the URL from an item
 * @returns Deduplicated array preserving original order
 */
export function deduplicateByUrl<T>(items: T[], getUrl: (item: T) => string | undefined): T[] {
  const seenUrls = new Set<string>();
  return items.filter((item) => {
    const url = getUrl(item);
    if (!url) return true;
    if (seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });
}
