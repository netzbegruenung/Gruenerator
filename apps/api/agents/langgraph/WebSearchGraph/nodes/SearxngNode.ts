/**
 * Searxng Node for WebSearchGraph
 * Executes web searches with SearXNG → Mistral fallback
 *
 * Uses per-query retry with circuit breaker:
 * - Each SearXNG call gets 1 retry on recoverable errors (timeout, 5xx)
 * - Batch Mistral fallback only activates after 2 consecutive SearXNG failures
 * - Circuit breaker auto-resets after 5 minutes
 */

import { MistralWebSearchService } from '../../../../services/mistral/index.js';
import { searxngService, withRetry, searxngCircuit } from '../../../../services/search/index.js';
import { getIntelligentSearchOptions } from '../utilities/searchOptions.js';

import type { WebSearchState, WebSearchBatch, SearchResult } from '../types.js';

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
    let useMistralFallback = searxngCircuit.isOpen();
    let fallbackReason: string | null = useMistralFallback ? 'Circuit breaker open' : null;
    const searchResults: WebSearchBatch[] = [];

    if (useMistralFallback) {
      console.log(
        '[WebSearchGraph] SearXNG circuit breaker is open, starting with Mistral fallback'
      );
    }

    for (let index = 0; index < (state.subqueries || []).length; index++) {
      const query = state.subqueries![index];
      let provider: 'searxng' | 'mistral' = 'searxng';

      try {
        let results: SearchResult[];

        if (useMistralFallback) {
          console.log(
            `[WebSearchGraph] Using Mistral (fallback mode) for query ${index + 1}: "${query}"`
          );
          provider = 'mistral';
          const mistralResult = await mistralSearchService.performWebSearch(query, 'content');
          results = normalizeMistralResults(mistralResult);
        } else {
          // Try SearXNG with per-query retry (1 retry, 500ms delay)
          console.log(`[WebSearchGraph] SearXNG search ${index + 1}: "${query}"`);
          const searchOptions = getIntelligentSearchOptions(query, state.mode, state.searchOptions);

          const searxngResult = await withRetry(
            () => searxngService.performWebSearch(query, searchOptions),
            { maxRetries: 1, delayMs: 500, label: `SearXNG query ${index + 1}` }
          );
          results = searxngResult.results || [];
          searxngCircuit.recordSuccess();
        }

        searchResults.push({
          query,
          success: true,
          results,
          provider,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // SearXNG failed even after retry — record failure in circuit breaker
        if (!useMistralFallback) {
          searxngCircuit.recordFailure();

          // Only activate batch fallback if circuit breaker is now open (2+ consecutive failures)
          if (searxngCircuit.isOpen()) {
            useMistralFallback = true;
            fallbackReason = errorMessage;
            console.warn(
              `[WebSearchGraph] SearXNG circuit opened after query ${index + 1}: ${errorMessage}`
            );
            console.log('[WebSearchGraph] Activating Mistral fallback for remaining queries');
          } else {
            console.warn(
              `[WebSearchGraph] SearXNG failed for query ${index + 1} (circuit still closed): ${errorMessage}`
            );
          }

          // Retry this specific query with Mistral
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
