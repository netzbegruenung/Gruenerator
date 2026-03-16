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

  // Collect results and searched collections
  const allResultSets = searchResults.map((r) => r.results);
  const searchedCollections = searchResults.flatMap((r) => r.searchedCollections || []);

  // Merge and deduplicate
  const merged = mergeSearchResults(...allResultSets);
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
