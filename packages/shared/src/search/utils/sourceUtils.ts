/**
 * Source Utility Functions
 * Platform-agnostic helper functions for search source processing
 */

import type { SearchResult } from '../types.js';

/**
 * Find sources that were actually used in the analysis text
 * Matches by URL or title mentions
 */
export function findUsedSources(
  sources: SearchResult[],
  analysisText: string,
  claudeSourceTitles: string[] = []
): SearchResult[] {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const matches = analysisText.match(urlRegex) || [];
  const usedUrls = Array.from(new Set(matches));

  return sources.filter((source) => {
    const urlMatch = usedUrls.some((url) => source.url.includes(url) || url.includes(source.url));

    const titleMatch =
      source.title &&
      (analysisText
        .toLowerCase()
        .includes(source.title.toLowerCase().substring(0, Math.min(source.title.length, 40))) ||
        claudeSourceTitles.some(
          (claudeTitle) =>
            claudeTitle.toLowerCase().includes(source.title.toLowerCase()) ||
            source.title.toLowerCase().includes(claudeTitle.toLowerCase())
        ));

    return urlMatch || titleMatch;
  });
}

/**
 * Format analysis text by wrapping paragraphs in <p> tags
 * Preserves existing HTML tags
 */
export function formatAnalysisText(text: string): string {
  const paragraphs = text.split('\n\n');

  return paragraphs
    .map((paragraph) => {
      if (paragraph.includes('<')) {
        return paragraph;
      }
      return `<p>${paragraph}</p>`;
    })
    .join('');
}

/**
 * Extract the main domain from a URL
 */
export function extractMainDomain(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return url;
  }
}
