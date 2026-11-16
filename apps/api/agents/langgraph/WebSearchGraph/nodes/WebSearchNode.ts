/**
 * Web search node for WebSearchGraph.
 * Runs each planner subquery through the web-search facade (`webSearch.ts`), so
 * the engine is whatever `WEB_SEARCH_CHAIN` names — this node never picks one.
 * Retries and circuit breakers live in the engines behind the facade.
 */

import { webSearch, type WebSearchRequest } from '../../../../services/search/webSearch.js';
import { getIntelligentSearchOptions } from '../utilities/searchOptions.js';

import type { SearchOptions, WebSearchBatch, WebSearchState } from '../types.js';

const WEB_SEARCH_UNAVAILABLE = 'Die Websuche ist derzeit nicht erreichbar.';

const TIME_RANGE_DAYS: Readonly<Record<string, number>> = { day: 1, week: 7, month: 30, year: 365 };

/** The planner's SearXNG-shaped options, as a facade request. */
export function toWebSearchRequest(query: string, options: SearchOptions): WebSearchRequest {
  const days = options.time_range ? TIME_RANGE_DAYS[options.time_range] : undefined;
  return {
    query,
    maxResults: options.maxResults ?? 10,
    ...(options.language === 'de-AT' ? { locale: 'de-AT' as const } : {}),
    ...(options.categories?.includes('news') ? { news: true } : {}),
    ...(days
      ? { fromDate: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) }
      : {}),
  };
}

export async function webSearchNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  const subqueries = state.subqueries || [];
  console.log(`[WebSearchGraph] Executing web searches for ${subqueries.length} queries`);

  const searchResults: WebSearchBatch[] = await Promise.all(
    subqueries.map(async (query, index): Promise<WebSearchBatch> => {
      const options = getIntelligentSearchOptions(query, state.mode, state.searchOptions);
      try {
        const res = await webSearch(toWebSearchRequest(query, options));
        return {
          query,
          success: true,
          provider: res.provider,
          results: res.hits.map((h) => ({
            url: h.url,
            title: h.title || 'Unbekannt',
            content: h.content,
            snippet: h.content.slice(0, 300),
          })),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[WebSearchGraph] Web search failed for query ${index + 1}: ${errorMessage}`);
        return { query, success: false, error: errorMessage, results: [], provider: null };
      }
    })
  );

  const successfulSearches = searchResults.filter((r) => r.success);
  const totalWebResults = successfulSearches.reduce((sum, r) => sum + r.results.length, 0);

  console.log(
    `[WebSearchGraph] Search completed: ${successfulSearches.length}/${searchResults.length} successful`
  );

  // Every query failed with at least one query attempted → the search is down,
  // not the query. Surface it so the caller can say so instead of silently
  // rendering an empty result set as "nothing found".
  const providerDown = searchResults.length > 0 && successfulSearches.length === 0;

  const providersUsed: Record<string, number> = {};
  for (const r of successfulSearches) {
    if (r.provider) providersUsed[r.provider] = (providersUsed[r.provider] ?? 0) + 1;
  }

  return {
    webResults: searchResults,
    ...(providerDown ? { error: WEB_SEARCH_UNAVAILABLE } : {}),
    metadata: {
      ...state.metadata,
      webSearches: searchResults.length,
      successfulWebSearches: successfulSearches.length,
      totalWebResults,
      providersUsed,
      ...(providerDown ? { criticalFailure: true } : {}),
    },
  };
}
