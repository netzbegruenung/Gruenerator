/**
 * Search Executor Node
 *
 * Runs parallel document + web search using ChatGraph's extracted helpers.
 * Always searches both sources (hybrid) — the search graph has no classifier,
 * it always searches.
 */

import { createLogger } from '../../../../utils/logger.js';
import {
  executeDocumentSearchParallel,
  executeWebSearchParallel,
  mergeSearchResults,
  buildCitations,
} from '../../ChatGraph/nodes/searchNode.js';

import type { SearchGraphState, ChatSearchResult } from '../types.js';

const log = createLogger('SearchGraph:SearchExecutor');

/** Domains that rarely provide useful search context */
const LOW_VALUE_DOMAINS = new Set([
  'tripadvisor.de',
  'tripadvisor.com',
  'booking.com',
  'expedia.de',
  'kurz-mal-weg.de',
  'holidaycheck.de',
  'verbraucherzentrale.de',
  'ebay.de',
  'amazon.de',
]);

/**
 * Filter web results by query term overlap and domain quality.
 * Removes results that have no meaningful connection to the search query.
 */
function filterWebResults(results: ChatSearchResult[], query: string): ChatSearchResult[] {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (queryTerms.length === 0) return results;

  return results.filter((r) => {
    // Check domain blacklist
    if (r.url) {
      try {
        const domain = new URL(r.url).hostname.replace(/^www\./, '');
        if (LOW_VALUE_DOMAINS.has(domain)) return false;
      } catch {
        /* ignore */
      }
    }

    // Require at least one query term in title or content
    const text = `${r.title} ${r.content}`.toLowerCase();
    const hasOverlap = queryTerms.some((term) => text.includes(term));
    return hasOverlap;
  });
}

interface SearchBatchResult {
  source: string;
  results: ChatSearchResult[];
  searchedCollections?: string[];
}

export async function searchExecutorNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();
  const { searchQuery, subQueries, aiWorkerPool, userLocale, agentConfig } = state;

  if (!searchQuery) {
    log.warn('[SearchExecutor] No search query, skipping');
    return { searchTimeMs: Date.now() - start };
  }

  log.info(
    `[SearchExecutor] Searching: "${searchQuery.substring(0, 80)}" (${state.searchSources.join(', ')})`
  );

  const searchPromises: Promise<SearchBatchResult>[] = [];

  // Document search (Qdrant collections)
  if (state.searchSources.includes('documents')) {
    searchPromises.push(
      executeDocumentSearchParallel(
        searchQuery,
        subQueries,
        state.notebookCollectionIds,
        agentConfig,
        state.detectedFilters,
        userLocale,
        state.defaultNotebookCollectionIds
      )
        .then(({ results, searchedCollections }) => ({
          source: 'documents',
          results,
          searchedCollections,
        }))
        .catch((err: unknown) => {
          log.warn(
            `[SearchExecutor] Document search failed: ${err instanceof Error ? err.message : err}`
          );
          return { source: 'documents', results: [], searchedCollections: [] };
        })
    );
  }

  // Web search (SearXNG + query expansion)
  if (state.searchSources.includes('web')) {
    searchPromises.push(
      executeWebSearchParallel(searchQuery, aiWorkerPool)
        .then((results) => ({ source: 'web', results }))
        .catch((err: unknown) => {
          log.warn(
            `[SearchExecutor] Web search failed: ${err instanceof Error ? err.message : err}`
          );
          return { source: 'web', results: [] };
        })
    );
  }

  const searchResults = await Promise.all(searchPromises);

  // Filter web results: remove clearly irrelevant hits
  for (const batch of searchResults) {
    if (batch.source === 'web') {
      batch.results = filterWebResults(batch.results, searchQuery);
    }
  }

  // Collect results and searched collections
  const searchedCollections = searchResults.flatMap((r) => r.searchedCollections || []);

  // Balance 50/50: take equal amounts from each source before merging
  const RESULTS_PER_SOURCE = 6;
  const balancedSets = searchResults.map((r) => r.results.slice(0, RESULTS_PER_SOURCE));

  // Merge and deduplicate (balanced input ensures ~50/50 mix)
  const merged = mergeSearchResults(...balancedSets);
  const citations = buildCitations(merged);

  const searchTimeMs = Date.now() - start;
  log.info(
    `[SearchExecutor] Found ${merged.length} results (${searchResults.map((r) => `${r.source}:${r.results.length}`).join(', ')}) in ${searchTimeMs}ms`
  );

  return {
    searchResults: merged,
    citations,
    searchedCollections,
    searchCount: 1,
    searchTimeMs,
  };
}
