/**
 * Deep Research Node
 *
 * Wraps WebSearchGraph nodes (planner → searxng → crawler → enricher → aggregator)
 * into a single SearchGraph node for deep research mode.
 *
 * Converts WebSearchGraph's state format to SearchGraph's format on output.
 */

import { createLogger } from '../../../../utils/logger.js';
import { buildCitations } from '../../ChatGraph/nodes/searchNode.js';
import { aggregatorNode } from '../../WebSearchGraph/nodes/AggregatorNode.js';
import { contentEnricherNode } from '../../WebSearchGraph/nodes/ContentEnricherNode.js';
import { grundsatzNode } from '../../WebSearchGraph/nodes/GrundsatzNode.js';
import { intelligentCrawlerNode } from '../../WebSearchGraph/nodes/IntelligentCrawlerNode.js';
import { plannerNode } from '../../WebSearchGraph/nodes/PlannerNode.js';
import { searxngNode } from '../../WebSearchGraph/nodes/SearxngNode.js';

import type { WebSearchState } from '../../WebSearchGraph/types.js';
import type { SearchGraphState, ChatSearchResult } from '../types.js';

const log = createLogger('SearchGraph:DeepResearch');

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Progress callback type for SSE event emission during research.
 * Set by the controller before graph execution.
 */
export type ResearchProgressCallback = (step: string, message: string) => void;

// Module-level callback — set by the controller before each invocation
let progressCallback: ResearchProgressCallback | null = null;

export function setResearchProgressCallback(cb: ResearchProgressCallback | null): void {
  progressCallback = cb;
}

function emitProgress(step: string, message: string): void {
  progressCallback?.(step, message);
}

/**
 * Build WebSearchGraph-compatible state from SearchGraph state.
 */
function toWebSearchState(state: SearchGraphState): WebSearchState {
  return {
    query: state.searchQuery || '',
    mode: 'deep',
    user_id: 'search-graph',
    searchOptions: state.searchOptions || { maxResults: 10, language: 'de-DE' },
    aiWorkerPool: state.aiWorkerPool,
    req: null,
    subqueries: state.subQueries || undefined,
    metadata: { startTime: Date.now(), searchMode: 'deep' },
  };
}

/**
 * Merge partial result into WebSearchState.
 */
function mergeWebState(base: WebSearchState, partial: Partial<WebSearchState>): WebSearchState {
  return {
    ...base,
    ...partial,
    metadata: { ...base.metadata, ...partial.metadata },
  };
}

/**
 * Convert WebSearchGraph results to ChatGraph's SearchResult format.
 */
function convertToSearchResults(webState: WebSearchState): ChatSearchResult[] {
  const results: ChatSearchResult[] = [];
  const seenUrls = new Set<string>();

  // Aggregated results (from aggregator node)
  if (webState.aggregatedResults) {
    for (const r of webState.aggregatedResults) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      results.push({
        source: 'deep-research',
        title: r.title,
        content: r.content || r.snippet || '',
        url: r.url,
        relevance: r.score || 0.7,
      });
    }
  }

  // Grundsatz results (official party positions)
  if (webState.grundsatzResults?.results) {
    for (const r of webState.grundsatzResults.results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      results.push({
        source: 'gruenerator:grundsatz',
        title: r.title,
        content: r.content || r.snippet || '',
        url: r.url,
        relevance: 0.9,
      });
    }
  }

  // If aggregator didn't run, fall back to raw web results
  if (results.length === 0 && webState.webResults) {
    for (const batch of webState.webResults) {
      for (const r of batch.results) {
        if (r.url && seenUrls.has(r.url)) continue;
        if (r.url) seenUrls.add(r.url);
        results.push({
          source: 'web',
          title: r.title,
          content: r.content || r.snippet || '',
          url: r.url,
          relevance: r.score || 0.5,
        });
      }
    }
  }

  results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return results.slice(0, 12);
}

export async function deepResearchNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  if (!state.searchQuery) {
    log.warn('[DeepResearch] No search query, skipping');
    return { searchTimeMs: Date.now() - start };
  }

  log.info(`[DeepResearch] Starting deep research: "${state.searchQuery.substring(0, 80)}"`);

  let webState = toWebSearchState(state);

  // Step 1: Planner (already done by queryOptimizer, but planner adds more optimization)
  emitProgress('planning', 'Plane Recherche-Strategie...');
  try {
    webState = mergeWebState(webState, await plannerNode(webState));
  } catch (err: unknown) {
    log.warn(`[DeepResearch] Planner failed: ${errorMessage(err)}`);
  }

  // Step 2: SearXNG + Grundsatz in parallel (both only need planner output, not each other)
  emitProgress('searching', 'Durchsuche das Web...');
  emitProgress('grundsatz', 'Durchsuche Parteiprogramme...');

  const [searxngResult, grundsatzResult] = await Promise.all([
    searxngNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] SearXNG failed: ${errorMessage(err)}`);
      return {};
    }),
    grundsatzNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] Grundsatz failed: ${errorMessage(err)}`);
      return {};
    }),
  ]);

  webState = mergeWebState(webState, searxngResult);
  webState = mergeWebState(webState, grundsatzResult);

  // Step 3: Intelligent Crawler
  emitProgress('analyzing', 'Analysiere Quellen...');
  try {
    webState = mergeWebState(webState, await intelligentCrawlerNode(webState));
  } catch (err: unknown) {
    log.warn(`[DeepResearch] Crawler analysis failed: ${errorMessage(err)}`);
  }

  // Step 4: Content Enricher
  emitProgress('crawling', 'Lese relevante Seiten...');
  try {
    webState = mergeWebState(webState, await contentEnricherNode(webState));
  } catch (err: unknown) {
    log.warn(`[DeepResearch] Content enricher failed: ${errorMessage(err)}`);
  }

  // Step 5: Aggregator
  emitProgress('aggregating', 'Aggregiere Ergebnisse...');
  try {
    webState = mergeWebState(webState, await aggregatorNode(webState));
  } catch (err: unknown) {
    log.warn(`[DeepResearch] Aggregator failed: ${errorMessage(err)}`);
  }

  // Convert to SearchGraph format
  const searchResults = convertToSearchResults(webState);
  const citations = buildCitations(searchResults);

  const searchTimeMs = Date.now() - start;
  log.info(`[DeepResearch] Complete: ${searchResults.length} results in ${searchTimeMs}ms`);

  return {
    searchResults,
    citations,
    searchCount: 1,
    searchTimeMs,
    webSearchBatches: webState.webResults || [],
    enrichedResults: webState.enrichedResults || [],
    categorizedSources: webState.categorizedSources || null,
    crawlMetadata: webState.crawlMetadata || null,
    searchedCollections: ['web', 'grundsatz'],
  };
}
