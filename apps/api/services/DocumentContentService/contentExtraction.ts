/**
 * Content extraction operations
 * Handles intelligent excerpt creation and text extraction
 */

import type { TextMatch, ExcerptOptions } from './types.js';

/**
 * Determine the best content strategy for a document based on multiple factors
 */
export function determineContentStrategy(doc: any, query: string): boolean {
  const text = doc.ocr_text || '';
  const pageCount = doc.page_count || 0;
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter((word: string) => word.length > 0).length;

  // Factor 1: Page count (most reliable indicator)
  if (pageCount <= 1) return true; // Single page documents always use full content
  if (pageCount >= 10) return false; // Very long documents always use excerpts

  // Factor 2: Character count
  if (charCount <= 1500) return true; // Very short documents
  if (charCount >= 8000) return false; // Very long documents

  // Factor 3: Word density (chars per word) - detect scanned documents with OCR errors
  const avgCharsPerWord = wordCount > 0 ? charCount / wordCount : 0;
  if (avgCharsPerWord > 15) return false; // Likely OCR errors, use excerpt to avoid noise

  // Factor 4: Query relevance - if query matches document title/filename, more likely to be relevant
  if (query && query.trim()) {
    const queryLower = query.toLowerCase();
    const titleLower = (doc.title || '').toLowerCase();
    const filenameLower = (doc.filename || '').toLowerCase();

    if (titleLower.includes(queryLower) || filenameLower.includes(queryLower)) {
      // High relevance - be more generous with full content for smaller docs
      return pageCount <= 3 && charCount <= 4000;
    }
  }

  // Factor 5: Default thresholds for medium-size documents
  if (pageCount <= 2 && charCount <= 3000) return true;

  // Default to excerpt for everything else
  return false;
}

/**
 * Create an intelligent excerpt from document text based on search query
 * Falls back when vector search is not available
 */
export function createIntelligentExcerpt(
  text: string,
  query: string,
  maxLength: number = 1500
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Find all occurrences of query terms
  const queryTerms = queryLower.split(/\s+/).filter((term: string) => term.length > 2);
  const matches: TextMatch[] = [];

  queryTerms.forEach((term: string) => {
    let index = textLower.indexOf(term);
    while (index !== -1) {
      matches.push({ index, term, length: term.length });
      index = textLower.indexOf(term, index + 1);
    }
  });

  if (matches.length === 0) {
    // No matches found, return beginning of document
    return text.substring(0, maxLength) + '...';
  }

  // Sort matches by position
  matches.sort((a, b) => a.index - b.index);

  // Create excerpt around the first significant match
  const firstMatch = matches[0];
  const excerptStart = Math.max(0, firstMatch.index - Math.floor(maxLength / 3));
  const excerptEnd = Math.min(text.length, excerptStart + maxLength);

  let excerpt = text.substring(excerptStart, excerptEnd);

  // Try to cut at sentence boundaries
  if (excerptStart > 0) {
    const sentenceStart = excerpt.indexOf('. ');
    if (sentenceStart > 0 && sentenceStart < 100) {
      excerpt = excerpt.substring(sentenceStart + 2);
    } else {
      excerpt = '...' + excerpt;
    }
  }

  if (excerptEnd < text.length) {
    const lastSentence = excerpt.lastIndexOf('.');
    if (lastSentence > excerpt.length * 0.8) {
      excerpt = excerpt.substring(0, lastSentence + 1);
    } else {
      excerpt = excerpt + '...';
    }
  }

  return excerpt;
}

/**
 * Helper function to extract relevant text around search terms
 */
export function extractRelevantText(
  text: string,
  query: string,
  maxLength: number = 300
): string {
  if (!text) return '';

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);

  if (index === -1) {
    // If exact match not found, return beginning of text
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  // Extract text around the match
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);

  let excerpt = text.substring(start, end);

  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}
