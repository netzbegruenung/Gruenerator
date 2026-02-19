/**
 * Search options configuration for WebSearchGraph
 * Handles intelligent search parameter selection based on query content.
 *
 * Uses TemporalAnalyzer for robust temporal detection instead of
 * hardcoded year strings.
 */

import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';

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

  // Temporal detection using TemporalAnalyzer
  const temporal = analyzeTemporality(query);
  if (temporal.hasTemporal) {
    options.categories = temporal.urgency === 'immediate' ? 'news' : 'general,news';
    if (temporal.suggestedTimeRange) {
      options.time_range = temporal.suggestedTimeRange;
    }
    console.log(
      `[WebSearchGraph] Temporal detected (${temporal.urgency}): time_range=${temporal.suggestedTimeRange} for: "${query}"`
    );
  }

  return options;
}
