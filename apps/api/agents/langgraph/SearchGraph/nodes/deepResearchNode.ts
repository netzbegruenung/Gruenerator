/**
 * Deep Research Node
 *
 * Wraps WebSearchGraph nodes (planner → web search → crawler → enricher → aggregator)
 * into a single SearchGraph node for deep research mode.
 *
 * Converts WebSearchGraph's state format to SearchGraph's format on output.
 */

import { canWebSearch, webSearch } from '../../../../services/search/webSearch.js';
import { createLogger } from '../../../../utils/logger.js';
import { buildCitations } from '../../ChatGraph/nodes/searchNode.js';
import { aggregatorNode } from '../../WebSearchGraph/nodes/AggregatorNode.js';
import { contentEnricherNode } from '../../WebSearchGraph/nodes/ContentEnricherNode.js';
import { grundsatzNode } from '../../WebSearchGraph/nodes/GrundsatzNode.js';
import { intelligentCrawlerNode } from '../../WebSearchGraph/nodes/IntelligentCrawlerNode.js';
import { plannerNode } from '../../WebSearchGraph/nodes/PlannerNode.js';
import { webSearchNode } from '../../WebSearchGraph/nodes/WebSearchNode.js';

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
    req: null as never,
    metadata: { startTime: Date.now(), searchMode: 'deep' },
    subqueries: state.subQueries ?? null,
    webResults: null,
    grundsatzResults: null,
    aggregatedResults: null,
    categorizedSources: {},
    referencesMap: null,
    citations: null,
    citationSources: null,
    crawlDecisions: null,
    enrichedResults: null,
    crawlMetadata: {},
    finalResults: null,
    summary: null,
    success: null,
    error: null,
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

/**
 * @deprecated since 2026-05 — superseded by the `depth: 'deep'` search in `deepResearchNode`.
 * Still live: `deepResearchNode` falls back here when no engine in the chain can serve
 * `deep`, and when that search fails (network, quota, revoked key). Its web step goes
 * through the facade like every other search.
 */
export async function deepResearchNodeLegacy(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  if (!state.searchQuery) {
    log.warn('[DeepResearch:Legacy] No search query, skipping');
    return { searchTimeMs: Date.now() - start };
  }

  log.info(`[DeepResearch:Legacy] Starting deep research: "${state.searchQuery.substring(0, 80)}"`);

  let webState = toWebSearchState(state);

  // Step 1: Planner (already done by queryOptimizer, but planner adds more optimization)
  emitProgress('planning', 'Plane Recherche-Strategie...');
  try {
    webState = mergeWebState(webState, await plannerNode(webState));
  } catch (err: unknown) {
    log.warn(`[DeepResearch] Planner failed: ${errorMessage(err)}`);
  }

  // Step 2: web search + Grundsatz in parallel (both only need planner output, not each other)
  emitProgress('searching', 'Durchsuche das Web...');
  emitProgress('grundsatz', 'Durchsuche Parteiprogramme...');

  const [webSearchResult, grundsatzResult] = await Promise.all([
    webSearchNode(webState).catch((err: unknown): Partial<WebSearchState> => {
      log.warn(`[DeepResearch] Web search failed: ${errorMessage(err)}`);
      return {};
    }),
    grundsatzNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] Grundsatz failed: ${errorMessage(err)}`);
      return {};
    }),
  ]);

  webState = mergeWebState(webState, webSearchResult);
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

/**
 * Deep research via a `depth: 'deep'` web search (webSearch.ts — today only
 * Linkup serves `deep`) — same search
 * depth as `deepResearch`, but `outputType: 'searchResults'` instead of
 * `sourcedAnswer`, so we get the same sources without paying for (and
 * discarding) an LLM-written answer. Replaces our planner → web search →
 * crawler → enricher → aggregator chain (now `deepResearchNodeLegacy`).
 *
 * Grundsatz (party-document) search runs in parallel against our internal
 * Qdrant collection — Linkup only covers the open web.
 *
 * Falls back to the legacy pipeline when no engine in the chain can do `deep`.
 */
export async function deepResearchNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  if (!state.searchQuery) {
    log.warn('[DeepResearch] No search query, skipping');
    return { searchTimeMs: Date.now() - start };
  }

  const request = {
    query: state.searchQuery,
    depth: 'deep' as const,
    maxResults: 20,
    ...(state.userLocale === 'de-AT' ? { locale: 'de-AT' as const } : {}),
  };
  if (!canWebSearch(request)) {
    log.info('[DeepResearch] No engine for depth deep — falling back to legacy pipeline');
    return deepResearchNodeLegacy(state);
  }

  log.info(`[DeepResearch] Starting deep web research: "${state.searchQuery.substring(0, 80)}"`);

  const webState = toWebSearchState(state);

  emitProgress('searching', 'Recherchiere im Web...');
  emitProgress('grundsatz', 'Durchsuche Parteiprogramme...');

  const [webResult, grundsatzResult] = await Promise.all([
    // `depth: 'deep'` keeps the search itself unchanged; `webSearch` (searchResults
    // output) replaces `deepResearch` (sourcedAnswer output) so we stop paying for
    // an LLM-written answer we never read — only `res.sources`/`res.results` below
    // ever left this function.
    webSearch(request).catch((err: unknown) => {
      log.warn(`[DeepResearch] Deep web search failed: ${errorMessage(err)}`);
      return null;
    }),
    grundsatzNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] Grundsatz failed: ${errorMessage(err)}`);
      return {};
    }),
  ]);

  // If the search itself failed (network, quota, key revoked), fall back to legacy
  // rather than returning grundsatz-only — the user asked for deep research.
  if (!webResult) {
    log.warn('[DeepResearch] Deep web search returned null — falling back to legacy pipeline');
    return deepResearchNodeLegacy(state);
  }

  emitProgress('aggregating', 'Aggregiere Ergebnisse...');

  const seenUrls = new Set<string>();
  const searchResults: ChatSearchResult[] = [];

  for (const src of webResult.hits) {
    if (!src.url || seenUrls.has(src.url)) continue;
    seenUrls.add(src.url);
    searchResults.push({
      source: 'deep-research',
      title: src.title || 'Unbekannt',
      content: src.content,
      url: src.url,
      relevance: 0.85,
    });
  }

  // Grundsatz comes from our internal Qdrant — keep it in the result mix
  const grundsatz = (grundsatzResult as Partial<WebSearchState>).grundsatzResults;
  if (grundsatz?.results) {
    for (const r of grundsatz.results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      searchResults.push({
        source: 'gruenerator:grundsatz',
        title: r.title,
        content: r.content || r.snippet || '',
        url: r.url,
        relevance: 0.9,
      });
    }
  }

  searchResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  const trimmed = searchResults.slice(0, 12);
  const citations = buildCitations(trimmed);

  const searchTimeMs = Date.now() - start;
  log.info(
    `[DeepResearch] Deep web search complete (${webResult.provider}): ${trimmed.length} sources in ${searchTimeMs}ms`
  );

  return {
    searchResults: trimmed,
    citations,
    searchCount: 1,
    searchTimeMs,
    searchedCollections: [`${webResult.provider}-deep`, 'grundsatz'],
  };
}
