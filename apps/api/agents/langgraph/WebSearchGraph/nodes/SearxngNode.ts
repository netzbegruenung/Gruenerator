/**
 * Searxng Node for WebSearchGraph
 * Executes web searches with SearXNG → Mistral fallback
 */

import type { WebSearchState, WebSearchBatch, SearchResult } from '../types.js';
import { searxngService } from '../../../../services/search/index.js';
import { MistralWebSearchService } from '../../../../services/mistral/index.js';
import { getIntelligentSearchOptions } from '../utilities/searchOptions.js';

const mistralSearchService = new MistralWebSearchService();

/**
 * Helper: Normalize Mistral results to SearXNG format
 */
function normalizeMistralResults(mistralResult: any): SearchResult[] {
  if (!mistralResult.sources || mistralResult.sources.length === 0) {
    return [];
  }
  return mistralResult.sources.map((source: any) => ({
    url: source.url,
    title: source.title,
    content: source.snippet || mistralResult.textContent || '',
    snippet: source.snippet || '',
    domain: source.domain,
    score: source.relevance || 1.0,
  }));
}

/**
 * Searxng Node: Execute web searches with fallback
 */
export async function searxngNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  console.log(
    `[WebSearchGraph] Executing web searches for ${state.subqueries?.length || 0} queries`
  );

  try {
    let useMistralFallback = false;
    let fallbackReason: string | null = null;
    const searchResults: WebSearchBatch[] = [];

    for (let index = 0; index < (state.subqueries || []).length; index++) {
      const query = state.subqueries![index];
      let provider: 'searxng' | 'mistral' = 'searxng';

      try {
        let results: SearchResult[];

        // Use Mistral if fallback was triggered for previous query (batch fallback)
        if (useMistralFallback) {
          console.log(
            `[WebSearchGraph] Using Mistral (fallback mode) for query ${index + 1}: "${query}"`
          );
          provider = 'mistral';
          const mistralResult = await mistralSearchService.performWebSearch(query, 'content');
          results = normalizeMistralResults(mistralResult);
        } else {
          // Try SearXNG first
          console.log(`[WebSearchGraph] SearXNG search ${index + 1}: "${query}"`);
          const searchOptions = getIntelligentSearchOptions(query, state.mode, state.searchOptions);
          const searxngResult = await searxngService.performWebSearch(query, searchOptions);
          results = searxngResult.results || [];
        }

        searchResults.push({
          query,
          success: true,
          results,
          provider,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // SearXNG failed - activate Mistral fallback for remaining queries
        if (!useMistralFallback) {
          useMistralFallback = true;
          fallbackReason = errorMessage;
          console.warn(`[WebSearchGraph] SearXNG failed for query ${index + 1}: ${errorMessage}`);
          console.log(
            `[WebSearchGraph] Activating Mistral fallback for this and all remaining queries`
          );

          // Retry this query with Mistral
          try {
            provider = 'mistral';
            const mistralResult = await mistralSearchService.performWebSearch(query, 'content');
            const results = normalizeMistralResults(mistralResult);

            searchResults.push({
              query,
              success: true,
              results,
              provider,
            });
            continue;
          } catch (mistralError) {
            const mistralErrorMsg =
              mistralError instanceof Error ? mistralError.message : String(mistralError);
            console.error(
              `[WebSearchGraph] Mistral fallback also failed for query ${index + 1}:`,
              mistralErrorMsg
            );
          }
        }

        // Both providers failed or Mistral failed during fallback mode
        console.error(
          `[WebSearchGraph] Search ${index + 1} failed (provider: ${provider}):`,
          errorMessage
        );
        searchResults.push({
          query,
          success: false,
          error: errorMessage,
          results: [],
          provider,
        });
      }
    }

    const successfulSearches = searchResults.filter((r) => r.success);
    const providerCounts = searchResults.reduce((acc: Record<string, number>, r) => {
      const p = r.provider || 'unknown';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});

    console.log(
      `[WebSearchGraph] Search completed: ${successfulSearches.length}/${searchResults.length} successful`
    );
    console.log(`[WebSearchGraph] Providers used: ${JSON.stringify(providerCounts)}`);
    if (useMistralFallback) {
      console.log(`[WebSearchGraph] Fallback activated: ${fallbackReason}`);
    }

    return {
      webResults: searchResults,
      metadata: {
        ...state.metadata,
        webSearches: searchResults.length,
        successfulWebSearches: successfulSearches.length,
        totalWebResults: successfulSearches.reduce((sum, r) => sum + r.results.length, 0),
        providersUsed: providerCounts,
        fallbackActivated: useMistralFallback,
        fallbackReason: fallbackReason || undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Web search node error:', errorMessage);
    return {
      webResults: [],
      error: `Web search failed: ${errorMessage}`,
      metadata: {
        ...state.metadata,
        webSearches: 0,
        successfulWebSearches: 0,
        criticalFailure: true,
      },
    };
  }
}
