/**
 * Data filtering utilities for WebSearchGraph
 * Reduces token usage by filtering large data structures for AI processing
 */

import type { WebSearchBatch, SearchResult, GrundsatzResult } from '../types.js';

/**
 * Filtered data structure for AI processing
 */
export interface FilteredData {
  webResults: Array<{
    query: string;
    success: boolean;
    resultCount: number;
    hasResults: boolean;
  }>;
  sources: Array<{
    title: string;
    url: string;
    snippet: string | null;
    domain: string | undefined;
  }>;
  grundsatz: {
    hasResults: boolean;
    resultCount: number;
    keyFindings: Array<{
      title: string;
      content: string;
      filename?: string;
      similarity_score?: number;
    }>;
  };
}

/**
 * Filter data for AI processing to reduce token usage
 */
export function filterDataForAI(
  webResults: WebSearchBatch[] | undefined,
  aggregatedResults: SearchResult[] | undefined,
  grundsatzResults: GrundsatzResult | null | undefined
): FilteredData {
  // Simplified filtering logic
  const filteredWebResults = (webResults || []).map((result) => ({
    query: result.query,
    success: result.success,
    resultCount: result.results?.length || 0,
    hasResults: (result.results?.length || 0) > 0,
  }));

  const filteredSources = (aggregatedResults || []).slice(0, 10).map((source) => ({
    title: source.title,
    url: source.url,
    snippet: (source as any).content_snippets?.substring(0, 150) || null,
    domain: source.domain,
  }));

  const filteredGrundsatz = grundsatzResults?.success
    ? {
        hasResults: (grundsatzResults.results?.length || 0) > 0,
        resultCount: grundsatzResults.results?.length || 0,
        keyFindings: (grundsatzResults.results || []).slice(0, 3).map((result) => ({
          title: result.title,
          content: result.content?.substring(0, 200) || '',
          filename: (result as any).filename,
          similarity_score: (result as any).similarity_score,
        })),
      }
    : { hasResults: false, resultCount: 0, keyFindings: [] };

  return {
    webResults: filteredWebResults,
    sources: filteredSources,
    grundsatz: filteredGrundsatz,
  };
}
