/**
 * Deep Research Node
 *
 * Wraps WebSearchGraph nodes (planner → searxng → crawler → enricher → aggregator)
 * into a single SearchGraph node for deep research mode.
 *
 * Converts WebSearchGraph's state format to SearchGraph's format on output.
 */

import { getLinkupService } from '../../../../services/search/LinkupService.js';
import { createLogger } from '../../../../utils/logger.js';
import { buildCitations } from '../../ChatGraph/nodes/searchNode.js';
import { aggregatorNode } from '../../WebSearchGraph/nodes/AggregatorNode.js';
import { contentEnricherNode } from '../../WebSearchGraph/nodes/ContentEnricherNode.js';
import { grundsatzNode } from '../../WebSearchGraph/nodes/GrundsatzNode.js';
import { intelligentCrawlerNode } from '../../WebSearchGraph/nodes/IntelligentCrawlerNode.js';
import { plannerNode } from '../../WebSearchGraph/nodes/PlannerNode.js';
import { searxngNode } from '../../WebSearchGraph/nodes/SearxngNode.js';

import type { WebSearchBatch, WebSearchState } from '../../WebSearchGraph/types.js';
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
 * Linkup-backed alternative to searxngNode for deep research.
 * Returns the same `{ webResults: WebSearchBatch[] }` shape, so downstream
 * nodes (crawler, enricher, aggregator) work unchanged.
 *
 * Falls back to null when LINKUP_API_KEY is unset — caller routes to searxngNode.
 */
async function searchViaLinkup(state: WebSearchState): Promise<Partial<WebSearchState> | null> {
  const linkup = getLinkupService();
  if (!linkup) return null;
  const subqueries = state.subqueries || [];
  if (subqueries.length === 0) return null;

  const maxResults = state.searchOptions?.maxResults ?? 10;
  const batches: WebSearchBatch[] = await Promise.all(
    subqueries.map(async (query): Promise<WebSearchBatch> => {
      try {
        const res = await linkup.webSearch({ query, maxResults });
        return {
          query,
          success: true,
          provider: 'linkup',
          results: res.results.map((r) => ({
            url: r.url,
            title: r.name || 'Unbekannt',
            content: r.content || '',
            snippet: (r.content || '').slice(0, 300),
          })),
        };
      } catch (err: unknown) {
        return {
          query,
          success: false,
          provider: 'linkup',
          results: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const successful = batches.filter((b) => b.success);
  log.info(`[DeepResearch] Linkup completed ${successful.length}/${batches.length} subqueries`);

  return {
    webResults: batches,
    metadata: {
      ...state.metadata,
      webSearches: batches.length,
      successfulWebSearches: successful.length,
      totalWebResults: successful.reduce((sum, b) => sum + b.results.length, 0),
      providersUsed: { linkup: batches.length },
    },
  };
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
    dossier: null,
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
 * @deprecated since 2026-05 — superseded by Linkup's deepResearch API in `deepResearchNode`.
 * Kept for rollback in case Linkup output quality regresses; not on any live code path
 * when LINKUP_API_KEY is set. Safe to delete once Linkup is proven in production.
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

  // Step 2: SearXNG + Grundsatz in parallel (both only need planner output, not each other)
  emitProgress('searching', 'Durchsuche das Web...');
  emitProgress('grundsatz', 'Durchsuche Parteiprogramme...');

  // Prefer Linkup when configured; fall back to SearXNG for dev/no-key envs.
  const webSearchPromise = (async (): Promise<Partial<WebSearchState>> => {
    const linkupResult = await searchViaLinkup(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] Linkup failed: ${errorMessage(err)}`);
      return null;
    });
    if (linkupResult) return linkupResult;
    return searxngNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] SearXNG failed: ${errorMessage(err)}`);
      return {};
    });
  })();

  const [searxngResult, grundsatzResult] = await Promise.all([
    webSearchPromise,
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

/**
 * Deep research via Linkup's `/search?depth=deep` API. Returns a synthesized
 * answer plus cited sources in one call — replaces our planner → searxng →
 * crawler → enricher → aggregator chain (now `deepResearchNodeLegacy`).
 *
 * Grundsatz (party-document) search runs in parallel against our internal
 * Qdrant collection — Linkup only covers the open web.
 *
 * Falls back to the legacy pipeline when LINKUP_API_KEY is unset.
 */
export async function deepResearchNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  if (!state.searchQuery) {
    log.warn('[DeepResearch] No search query, skipping');
    return { searchTimeMs: Date.now() - start };
  }

  const linkup = getLinkupService();
  if (!linkup) {
    log.info('[DeepResearch] LINKUP_API_KEY unset — falling back to legacy pipeline');
    return deepResearchNodeLegacy(state);
  }

  log.info(`[DeepResearch] Starting Linkup deep research: "${state.searchQuery.substring(0, 80)}"`);

  const linkupLocale: 'de' | 'at' = state.userLocale === 'de-AT' ? 'at' : 'de';
  const webState = toWebSearchState(state);

  emitProgress('searching', 'Linkup recherchiert das Web...');
  emitProgress('grundsatz', 'Durchsuche Parteiprogramme...');

  const [linkupResult, grundsatzResult] = await Promise.all([
    linkup
      .deepResearch({ question: state.searchQuery, locale: linkupLocale })
      .catch((err: unknown) => {
        log.warn(`[DeepResearch] Linkup failed: ${errorMessage(err)}`);
        return null;
      }),
    grundsatzNode(webState).catch((err: unknown) => {
      log.warn(`[DeepResearch] Grundsatz failed: ${errorMessage(err)}`);
      return {};
    }),
  ]);

  // If Linkup itself failed (network, quota, key revoked), fall back to legacy
  // rather than returning grundsatz-only — the user asked for deep research.
  if (!linkupResult) {
    log.warn('[DeepResearch] Linkup returned null — falling back to legacy pipeline');
    return deepResearchNodeLegacy(state);
  }

  emitProgress('aggregating', 'Aggregiere Ergebnisse...');

  const seenUrls = new Set<string>();
  const searchResults: ChatSearchResult[] = [];

  for (const src of linkupResult.sources) {
    if (!src.url || seenUrls.has(src.url)) continue;
    seenUrls.add(src.url);
    searchResults.push({
      source: 'deep-research',
      title: src.name || 'Unbekannt',
      content: src.snippet || '',
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
    `[DeepResearch] Linkup complete: ${trimmed.length} sources, answer=${linkupResult.answer.length} chars in ${searchTimeMs}ms`
  );

  return {
    searchResults: trimmed,
    citations,
    searchCount: 1,
    searchTimeMs,
    searchedCollections: ['linkup-deep', 'grundsatz'],
  };
}
