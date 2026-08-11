/**
 * Searxng Node for WebSearchGraph
 * Executes web searches against SearXNG.
 *
 * Uses per-query retry with circuit breaker:
 * - Each SearXNG call gets 1 retry on recoverable errors (timeout, 5xx)
 * - After 2 consecutive failures the circuit opens and remaining queries
 *   short-circuit instead of hammering a service that is known to be down
 * - Circuit breaker auto-resets after 5 minutes
 */

import { searxngService, withRetry, searxngCircuit } from '../../../../services/search/index.js';
import { getIntelligentSearchOptions } from '../utilities/searchOptions.js';

import type { WebSearchState, WebSearchBatch } from '../types.js';

const SEARXNG_UNAVAILABLE = 'Die Websuche ist derzeit nicht erreichbar.';

/**
 * Searxng Node: Execute web searches
 */
export async function searxngNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  console.log(
    `[WebSearchGraph] Executing web searches for ${state.subqueries?.length || 0} queries`
  );

  try {
    const searchResults: WebSearchBatch[] = [];
    let circuitOpen = searxngCircuit.isOpen();

    if (circuitOpen) {
      console.warn('[WebSearchGraph] SearXNG circuit breaker is open, skipping web search');
    }

    for (let index = 0; index < (state.subqueries || []).length; index++) {
      const query = state.subqueries![index];

      if (circuitOpen) {
        searchResults.push({
          query,
          success: false,
          error: `${SEARXNG_UNAVAILABLE} (Circuit Breaker offen)`,
          results: [],
          provider: 'searxng',
        });
        continue;
      }

      try {
        console.log(`[WebSearchGraph] SearXNG search ${index + 1}: "${query}"`);
        const searchOptions = getIntelligentSearchOptions(query, state.mode, state.searchOptions);

        const searxngResult = await withRetry(
          () => searxngService.performWebSearch(query, searchOptions),
          { maxRetries: 1, delayMs: 500, label: `SearXNG query ${index + 1}` }
        );
        searxngCircuit.recordSuccess();

        searchResults.push({
          query,
          success: true,
          results: searxngResult.results || [],
          provider: 'searxng',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // SearXNG failed even after retry — record failure in circuit breaker
        searxngCircuit.recordFailure();
        circuitOpen = searxngCircuit.isOpen();

        if (circuitOpen) {
          console.warn(
            `[WebSearchGraph] SearXNG circuit opened after query ${index + 1}: ${errorMessage}`
          );
        } else {
          console.warn(
            `[WebSearchGraph] SearXNG failed for query ${index + 1} (circuit still closed): ${errorMessage}`
          );
        }

        searchResults.push({
          query,
          success: false,
          error: errorMessage,
          results: [],
          provider: 'searxng',
        });
      }
    }

    const successfulSearches = searchResults.filter((r) => r.success);
    const totalWebResults = successfulSearches.reduce((sum, r) => sum + r.results.length, 0);

    console.log(
      `[WebSearchGraph] Search completed: ${successfulSearches.length}/${searchResults.length} successful`
    );

    // Every query failed with at least one query attempted → the provider is
    // down, not the query. Surface it so the caller can say so instead of
    // silently rendering an empty result set as "nothing found".
    const providerDown = searchResults.length > 0 && successfulSearches.length === 0;

    return {
      webResults: searchResults,
      ...(providerDown ? { error: SEARXNG_UNAVAILABLE } : {}),
      metadata: {
        ...state.metadata,
        webSearches: searchResults.length,
        successfulWebSearches: successfulSearches.length,
        totalWebResults,
        providersUsed: { searxng: searchResults.length },
        ...(providerDown ? { criticalFailure: true } : {}),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Web search node error:', errorMessage);
    return {
      webResults: [],
      error: `${SEARXNG_UNAVAILABLE} (${errorMessage})`,
      metadata: {
        ...state.metadata,
        webSearches: 0,
        successfulWebSearches: 0,
        criticalFailure: true,
      },
    };
  }
}
