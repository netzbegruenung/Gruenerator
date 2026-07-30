/**
 * Search Executor Node
 *
 * Runs parallel document + web search using ChatGraph's extracted helpers.
 * Always searches both sources (hybrid) — the search graph has no classifier,
 * it always searches.
 */

import { isLowValueDomain } from '../../../../services/search/domainFilters.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  executeDocumentSearchParallel,
  executeWebSearch,
  mergeSearchResults,
  buildCitations,
} from '../../ChatGraph/nodes/searchNode.js';

import type { SearchGraphState, ChatSearchResult } from '../types.js';

const log = createLogger('SearchGraph:SearchExecutor');

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
    if (isLowValueDomain(r.url)) return false;

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
  const { searchQuery, subQueries, userLocale, agentConfig } = state;

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

  // Web search. `/suche` "Schnell" is a deliberate user choice for the quick
  // mode, so it stays on the cheap tier — the deep engine lives behind the
  // "Tiefe Recherche" toggle, which routes to deepResearchNode instead.
  if (state.searchSources.includes('web')) {
    searchPromises.push(
      executeWebSearch(searchQuery, { tier: 'standard' })
        .then(({ results }) => ({ source: 'web', results }))
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
