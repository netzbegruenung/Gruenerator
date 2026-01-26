/**
 * Search options configuration for WebSearchGraph
 * Handles intelligent search parameter selection based on query content
 */

import type { SearchOptions } from '../types.js';

/**
 * Get intelligent search options based on query content and mode
 */
export function getIntelligentSearchOptions(
  query: string,
  mode: 'normal' | 'deep',
  baseOptions: SearchOptions = {}
): SearchOptions {
  const options: SearchOptions = {
    maxResults: mode === 'deep' ? 8 : 10,
    language: 'de-DE',
    safesearch: 0,
    categories: 'general',
    ...baseOptions,
  };

  const queryLower = query.toLowerCase();

  // German regional search detection
  const isGermanRegional = [
    'rhein-sieg',
    'deutschland',
    'nrw',
    'nordrhein-westfalen',
    'bonn',
    'köln',
    'landkreis',
    'germany',
    'german',
  ].some((term) => queryLower.includes(term));

  if (isGermanRegional) {
    options.categories = 'general,news';
    console.log(`[WebSearchGraph] Using German regional search settings for: "${query}"`);
  }

  // News search for current developments
  if (
    [
      'aktuelle',
      'entwicklung',
      'derzeit',
      'momentan',
      'heute',
      '2024',
      '2025',
      'situation',
      'stand',
      'status',
    ].some((term) => queryLower.includes(term))
  ) {
    options.categories = 'news';
    options.time_range = 'year';
    console.log(`[WebSearchGraph] Using news search for current developments: "${query}"`);
  }

  return options;
}
