/**
 * Direct Search Executors
 *
 * Provides direct Qdrant vector search, examples search, and web search
 * for chat tools, bypassing the MCP server. Reuses the existing
 * DocumentSearchService infrastructure.
 */

import { decodeHtmlEntities } from '@gruenerator/shared/utils';

import { COLLECTION_MAP } from '../../../config/collectionMap.js';
import { trailingSlugKey } from '../../../config/landesverbaendeConfig.js';
import {
  getSearchParams,
  buildSubcategoryFilter,
  applyDefaultFilter,
  type SubcategoryFilters,
} from '../../../config/systemCollectionsConfig.js';
import { DocumentSearchService } from '../../../services/document-services/index.js';
import { searchExamples } from '../../../services/examples/exampleSearchService.js';
import { withRetry } from '../../../services/search/index.js';
import {
  getLinkupService,
  type LinkupSearchResult,
} from '../../../services/search/LinkupService.js';
import { resolveSearchPlan, type SearchTier } from '../../../services/search/searchDepth.js';
import { searxngService } from '../../../services/search/SearxngService.js';
import { createLogger } from '../../../utils/logger.js';

import { extractDomain, formatRelevance, truncateText } from './searchFormatting.js';

import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';
import type { DocumentResult } from '../../../services/BaseSearchService/types.js';
import type {
  SearchResult as SearxngSearchResult,
  SearxngSearchOptions,
} from '../../../services/search/types.js';

const log = createLogger('DirectSearch');

/**
 * Cap on image hits carried out of a single search. Capped independently of
 * `maxResults` because images are a side panel, not sources: eight named links
 * fill the list without pushing the text results the answer is written from out
 * of the tier's budget.
 */
const MAX_IMAGE_HITS = 8;

export interface DirectSearchResult {
  collection: string;
  query: string;
  searchMode: string;
  resultsCount: number;
  results: Array<{
    rank: number;
    relevance: string;
    source: string;
    url?: string;
    excerpt: string;
    searchMethod: string;
    contentType?: string;
    documentId?: string;
    chunkIndex?: number;
    score?: number;
    collectionId?: string;
  }>;
  cached?: boolean;
  error?: boolean;
  message?: string;
}

export interface DirectExamplesResult {
  resultsCount: number;
  examples: Array<{
    id: string;
    platform: string;
    content: string;
    imageUrl?: string;
    author?: string;
    date?: string;
  }>;
  error?: boolean;
  message?: string;
}

export interface PressemitteilungExample {
  id: string;
  title: string;
  body: string;
  lv: string;
  sourceId?: string;
  publishedAt?: string;
  url?: string;
}

export interface DirectPressemitteilungExamplesResult {
  resultsCount: number;
  examples: PressemitteilungExample[];
  error?: boolean;
  message?: string;
}

/**
 * An image hit from the web search. Carries no `snippet`, because Linkup's image
 * entries carry no `content` — that absence is the whole reason these must not
 * travel with the text results.
 */
export interface WebImageHit {
  title: string;
  url: string;
  domain: string;
}

export interface DirectWebSearchResult {
  query: string;
  searchType: string;
  resultsCount: number;
  results: Array<{
    rank: number;
    title: string;
    url: string;
    snippet: string;
    domain: string;
    publishedDate?: string | null;
  }>;
  /**
   * Image hits, kept strictly apart from `results`. Only ever non-empty when the
   * caller asked for images (`includeImages`) — see the split in
   * `executeDirectWebSearch` for why they may never be mixed in.
   */
  images?: WebImageHit[];
  suggestions?: string[];
  error?: boolean;
  message?: string;
}

const documentSearchService = new DocumentSearchService();

/**
 * Collapse results that point at the same CMS node served under multiple path
 * aliases (e.g. TYPO3 serves a press release at both /nachrichten/x_NNN and
 * /pressemitteilungen/x_NNN). These share a trailing node id but get distinct
 * content_hash → document_id (rendering drift), so upstream document_id dedup
 * misses them. Results arrive relevance-ranked, so first-wins keeps the
 * best-scoring copy. URLs without a node id are never collapsed.
 */
function collapseAliasDuplicates(results: DocumentResult[]): DocumentResult[] {
  const seen = new Set<string>();
  const out: DocumentResult[] = [];
  for (const result of results) {
    const key = result.source_url ? trailingSlugKey(result.source_url) : null;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(result);
  }
  return out;
}

/**
 * Execute a direct document search against Qdrant.
 * Replaces the MCP tool call for gruenerator_search.
 */
export async function executeDirectSearch(params: {
  query: string;
  collection?: string;
  limit?: number;
  filters?: SubcategoryFilters;
  /**
   * Hard-pinned LV filter from agent metadata (e.g. Berlin agent → 'BE' / ['BE','BE-F']).
   * Merged into the Qdrant `must` clause regardless of what the LLM passes; ensures
   * an LV-scoped agent always grounds answers in its own Landesverband sources.
   * Only applied to collections targeting `landesverbaende_documents`.
   */
  agentLandesverband?: readonly string[] | string;
}): Promise<DirectSearchResult> {
  const { query, collection = 'deutschland', limit = 5, filters, agentLandesverband } = params;

  log.info(
    `[Direct Search] query="${query}" collection="${collection}" limit=${limit}${filters ? ` filters=${JSON.stringify(filters)}` : ''}${agentLandesverband ? ` lv=${JSON.stringify(agentLandesverband)}` : ''}`
  );

  const mapping = COLLECTION_MAP[collection];
  if (!mapping) {
    log.warn(`[Direct Search] Unknown collection: ${collection}, falling back to deutschland`);
  }

  const { qdrantCollection, systemId } = mapping || COLLECTION_MAP.deutschland;
  const searchParams = getSearchParams(systemId);

  // Build filter: merge (a) collection default, (b) user-detected, (c) agent LV pin
  const collectionDefault = applyDefaultFilter(systemId);
  const userFilter = buildSubcategoryFilter(filters);
  let agentLvFilter: QdrantFilter | undefined;
  if (agentLandesverband && qdrantCollection === 'landesverbaende_documents') {
    const lvList: string[] =
      typeof agentLandesverband === 'string' ? [agentLandesverband] : [...agentLandesverband];
    agentLvFilter = {
      must: [
        {
          key: 'landesverband',
          match: lvList.length === 1 ? { value: lvList[0] as string } : { any: lvList },
        },
      ],
    };
  }

  const filterParts = [collectionDefault, userFilter, agentLvFilter].filter(
    (f): f is QdrantFilter => f !== undefined
  );
  let additionalFilter: QdrantFilter | undefined;
  if (filterParts.length === 0) {
    additionalFilter = undefined;
  } else if (filterParts.length === 1) {
    additionalFilter = filterParts[0];
  } else {
    const mergedMust = filterParts.flatMap((f) => f.must || []);
    additionalFilter = { must: mergedMust as QdrantFilter['must'] };
  }

  try {
    let response = await documentSearchService.search({
      query,
      userId: undefined,
      options: {
        limit: Math.min(limit * 2, 30),
        mode: 'hybrid',
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection: qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
      },
    });

    if (!response.success || !response.results || response.results.length === 0) {
      // If we had user filters, consider retrying without them
      if (userFilter) {
        const hasExplicitFilters = filters && Object.keys(filters).length > 0;
        if (hasExplicitFilters) {
          // Explicit user-selected filters (e.g. notebook source filter) — respect them
          console.warn(
            `[Direct Search] No results with explicit user filters for "${query}" in ${collection}. ` +
              `NOT falling back to unfiltered search. Filters: ${JSON.stringify(filters)}`
          );
        } else {
          // Auto-detected/heuristic filters — safe to retry without
          log.info(
            `[Direct Search] No results with auto-detected filters, retrying without for "${query}" in ${collection}`
          );
          const fallbackFilter = collectionDefault;
          const fallbackResponse = await documentSearchService.search({
            query,
            userId: undefined,
            options: {
              limit: Math.min(limit * 2, 30),
              mode: 'hybrid',
              vectorWeight: searchParams.vectorWeight,
              textWeight: searchParams.textWeight,
              threshold: searchParams.threshold,
              searchCollection: qdrantCollection,
              recallLimit: searchParams.recallLimit,
              qualityMin: searchParams.qualityMin,
              additionalFilter: fallbackFilter,
            },
          });
          if (fallbackResponse.success && fallbackResponse.results?.length > 0) {
            log.info(
              `[Direct Search] Fallback without auto-detected filters found ${fallbackResponse.results.length} results`
            );
            response = fallbackResponse;
          }
        }
      }

      // A backend failure is NOT "nothing found": conflating them made the tool
      // card render green and the model tell the user there is no such content,
      // when in fact the search never ran. `error: true` is what wrapTools'
      // isErrorResult reads, so the card turns red and the model sees a failure
      // it can be honest about.
      if (!response.success) {
        log.warn(
          `[Direct Search] Search failed for "${query}" in ${collection}: ${response.error ?? 'unknown error'}`
        );
        return {
          collection,
          query,
          searchMode: 'hybrid',
          resultsCount: 0,
          results: [],
          error: true,
          message: 'Die Dokumentsuche ist momentan gestört — es konnte nicht gesucht werden.',
        };
      }

      if (!response.results || response.results.length === 0) {
        log.info(`[Direct Search] No results found for query: "${query}" in ${collection}`);
        return {
          collection,
          query,
          searchMode: 'hybrid',
          resultsCount: 0,
          results: [],
          message: 'Keine Ergebnisse gefunden.',
        };
      }
    }

    const formattedResults = collapseAliasDuplicates(response.results)
      .slice(0, limit)
      .map((result: DocumentResult, index: number) => ({
        rank: index + 1,
        relevance: formatRelevance(result.similarity_score || result.max_similarity || 0),
        source: result.title || 'Unbekannte Quelle',
        ...(result.source_url ? { url: result.source_url } : {}),
        excerpt: truncateText(
          result.relevant_content || result.top_chunks?.[0]?.preview || '',
          800
        ),
        searchMethod: result.search_methods?.[0] || 'hybrid',
        ...(result.top_chunks?.[0]?.content_type
          ? { contentType: result.top_chunks[0].content_type }
          : {}),
        ...(result.document_id ? { documentId: result.document_id } : {}),
        ...(result.chunk_index != null || result.top_chunks?.[0]?.chunk_index != null
          ? { chunkIndex: result.chunk_index ?? result.top_chunks?.[0]?.chunk_index }
          : {}),
        ...(result.similarity_score ? { score: result.similarity_score } : {}),
        collectionId: collection,
      }));

    log.info(`[Direct Search] Found ${formattedResults.length} results for "${query}"`);

    return {
      collection,
      query,
      searchMode: 'hybrid',
      resultsCount: formattedResults.length,
      results: formattedResults,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Direct Search] Error searching ${collection}:`, errMsg);
    return {
      collection,
      query,
      searchMode: 'hybrid',
      resultsCount: 0,
      results: [],
      error: true,
      message: `Suche fehlgeschlagen: ${errMsg}`,
    };
  }
}

/**
 * Execute a direct examples search for social media examples.
 * Replaces the MCP tool call for gruenerator_examples_search.
 * Uses the dedicated contentExamplesService for social media examples.
 *
 * @param params.country - Optional country filter ('DE' or 'AT') for country-specific agents
 */
export async function executeDirectExamplesSearch(params: {
  query: string;
  platform?: string;
  country?: 'DE' | 'AT';
  /** Override target collection — see `SearchExamplesParams.examplesCollection`. */
  collection?: string;
  lvScope?: string | readonly string[];
}): Promise<DirectExamplesResult> {
  const { query, platform, country, collection, lvScope } = params;

  const result = await searchExamples({
    query,
    kinds: ['social'],
    ...(platform && { platform }),
    ...(country && { country }),
    ...(collection && { examplesCollection: collection }),
    ...(lvScope !== undefined && { lvScope }),
  });

  if (result.errors.social) {
    return {
      resultsCount: 0,
      examples: [],
      error: true,
      message: `Beispielsuche fehlgeschlagen: ${result.errors.social}`,
    };
  }

  const items = result.byKind.social ?? [];
  if (items.length === 0) {
    return {
      resultsCount: 0,
      examples: [],
      message: 'Keine Beispiele gefunden.',
    };
  }

  const examples = items.map((e) => ({
    id: e.id,
    platform: e.platform ?? platform ?? 'unknown',
    content: e.body,
    ...(e.author && { author: e.author }),
    ...(e.publishedAt && { date: e.publishedAt }),
  }));

  return { resultsCount: examples.length, examples };
}

/**
 * Execute a Pressemitteilung-examples search, optionally scoped to one or more
 * Landesverbände. Thin wrapper over the unified `searchExamples` service
 * (kinds=['press']). Callers pass `lvScope` (derived via `resolveExamplesLvScope`)
 * so an LV agent only ever grounds in its own LV's press releases — without it
 * the composer mimics whichever LV happened to match (wrong-LV PMs).
 */
export async function executeDirectPressemitteilungExamples(params: {
  query: string;
  limit?: number;
  lvScope?: string | readonly string[];
  country?: 'DE' | 'AT';
}): Promise<DirectPressemitteilungExamplesResult> {
  const { query, limit = 6, lvScope, country } = params;

  const result = await searchExamples({
    query,
    kinds: ['press'],
    limit,
    ...(lvScope !== undefined && { lvScope }),
    ...(country && { country }),
  });

  if (result.errors.press) {
    return {
      resultsCount: 0,
      examples: [],
      error: true,
      message: `Pressemitteilung-Suche fehlgeschlagen: ${result.errors.press}`,
    };
  }

  const items = result.byKind.press ?? [];
  if (items.length === 0) {
    return {
      resultsCount: 0,
      examples: [],
      message: 'Keine passenden Pressemitteilungen gefunden.',
    };
  }

  const examples: PressemitteilungExample[] = items.map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    lv: e.lv ?? '',
    ...(e.sourceId && { sourceId: e.sourceId }),
    ...(e.publishedAt && { publishedAt: e.publishedAt }),
    ...(e.url && { url: e.url }),
  }));

  return { resultsCount: examples.length, examples };
}

/**
 * The chat's single web-retrieval door, at one of three tiers.
 *
 * `tier` replaces the old split between this function and `executeResearch`:
 * "recherchiere" no longer routes to a different engine, it routes here with a
 * deeper setting. `maxResults` stays an independent override for callers that
 * want a specific count (news widgets, compound turns); the tier only supplies
 * the default.
 *
 * Every caller goes through `resolveSearchPlan`, so the engine depth, the result
 * count and the adjacent-keyword instruction are decided in ONE place — the
 * multi-source path used to hard-code `maxResults: 5` and pass no tier at all,
 * which quietly made comparison turns the shallowest ones in the product.
 *
 * Falls back to SearXNG when LINKUP_API_KEY is unset — SearXNG has no depth
 * concept, so every tier degrades to one flat search there. That is a
 * dev/self-host path; production has the key.
 */
export async function executeDirectWebSearch(params: {
  query: string;
  searchType?: 'general' | 'news';
  tier?: SearchTier;
  maxResults?: number;
  timeRange?: string;
  language?: string;
  /**
   * Site scope, applied by the engine before we pay. `include` narrows the search
   * to these hosts ("such auf zeit.de"); `exclude` keeps them out and carries the
   * low-value default list. Bare hosts, no scheme.
   */
  includeDomains?: readonly string[];
  excludeDomains?: readonly string[];
  /** Explicit ISO window (YYYY-MM-DD). Wins over `timeRange`, which is a preset. */
  fromDate?: string;
  toDate?: string;
  /**
   * Ask the engine for image hits alongside the text ones. Never a default: on a
   * factual question the images are paid for and then looked at by nobody, and
   * they arrive mixed into the same result array (see the split below).
   */
  includeImages?: boolean;
}): Promise<DirectWebSearchResult> {
  const { query, searchType = 'general', tier, timeRange, language = 'de-DE' } = params;
  const plan = resolveSearchPlan({
    ...(tier ? { tier } : {}),
    query,
    ...(params.maxResults != null ? { maxResults: params.maxResults } : {}),
  });
  const maxResults = plan.maxResults;

  // An include scope and the default block list are not the same kind of
  // statement: naming sites is a positive instruction, so the block list must not
  // ride along and silently subtract from it. (Linkup applies both if both are
  // sent, and "search zeit.de but not amazon.de" is a scope nobody asked for.)
  const includeDomains = params.includeDomains ?? [];
  const excludeDomains = includeDomains.length > 0 ? [] : (params.excludeDomains ?? []);

  // `searchType: 'news'` was a documented parameter that did nothing at all on
  // the Linkup path — the branch below only ever used it for SearXNG's category.
  // A news search is a recency constraint, so that is what it now buys.
  const NEWS_WINDOW_DAYS = 30;
  const fromDate =
    params.fromDate ??
    (timeRange ? timeRangeToFromDate(timeRange) : undefined) ??
    (searchType === 'news' ? daysAgoIso(NEWS_WINDOW_DAYS) : undefined);
  // The deeper tiers exist to give the writing model more to work with; a
  // 300-char snippet would cap that no matter how many sources came back.
  // Stays under the source registry's own per-line cap (1500).
  const snippetChars = plan.depth === 'deep' ? 1200 : 300;
  // Images ride in the same array as the text hits and are capped separately, so
  // asking for them cannot eat into `maxResults` and leave the answer with fewer
  // sources than the tier promised.
  const includeImages = params.includeImages === true;

  // One line carrying the COMPLETE commissioned search. Without it there was no
  // way to tell from the logs what a turn actually asked the engine for — which
  // is how `searchType: 'news'` survived for months as a no-op on this path.
  log.info(
    `[Direct Web Search] query="${query}" type="${searchType}" tier=${plan.tier} depth=${plan.depth}${plan.fastReason ? `(${plan.fastReason})` : ''} max=${maxResults} adjacent=${plan.adjacentSearches} lang=${language}${
      includeDomains.length > 0 ? ` include=[${includeDomains.join(',')}]` : ''
    }${excludeDomains.length > 0 ? ` exclude=${excludeDomains.length}` : ''}${
      fromDate ? ` from=${fromDate}` : ''
    }${params.toDate ? ` to=${params.toDate}` : ''}${timeRange ? ` timeRange=${timeRange}` : ''}${
      includeImages ? ' images=on' : ''
    }`
  );

  try {
    const linkup = getLinkupService();
    if (linkup) {
      const search = (depth: typeof plan.depth) =>
        linkup.webSearch({
          query,
          depth,
          maxResults,
          adjacentSearches: plan.adjacentSearches,
          ...(includeDomains.length > 0 ? { includeDomains } : {}),
          ...(excludeDomains.length > 0 ? { excludeDomains } : {}),
          ...(fromDate ? { fromDate } : {}),
          ...(params.toDate ? { toDate: params.toDate } : {}),
          ...(includeImages ? { includeImages: true } : {}),
        });
      // `fast` is flagged beta in Linkup's docs, so it is the one depth that could
      // be rejected for an account without anything else being wrong. A keyword
      // lookup must not fail over an optimisation: fall back to the depth we know
      // works, once, and say so in the log.
      const linkupRes = await (plan.depth === 'fast'
        ? search('fast').catch((err: unknown) => {
            log.warn(
              `[Direct Web Search] fast depth rejected (${err instanceof Error ? err.message : String(err)}) — retrying at standard`
            );
            return search('standard');
          })
        : search(plan.depth));
      // Linkup mixes image entries into the SAME array as the text ones, and an
      // image entry has `name` + `url` but NO `content`. The `type` field has
      // existed on the result shape all along and nothing read it, so every entry
      // was mapped as a text result — which was harmless only for as long as no
      // caller asked for images. The moment one does, an unsplit mapping puts
      // content-less entries into the source registry, where they become numbered
      // citations backing a claim with an empty snippet. Splitting first is
      // therefore not cleanup, it is the precondition for `includeImages`.
      const { text: textEntries, images: imageEntries } = partitionLinkupResults(linkupRes.results);
      const linkupFormatted = textEntries.slice(0, maxResults).map((r, i) => ({
        rank: i + 1,
        // Linkup returns raw HTML-entity-encoded titles/snippets (e.g. "&Ouml;sterreich").
        title: decodeHtmlEntities(r.name) || 'Unbekannt',
        url: r.url,
        snippet: truncateText(decodeHtmlEntities(r.content), snippetChars),
        domain: extractDomain(r.url),
        // Was hard-coded `null`, so `recencyBoost`/`resolveSourceDate` scored
        // nothing for web hits — the one source type where freshness matters
        // most. Normalised rather than passed through: a value the ranking
        // cannot parse is worse than none, because it looks like data.
        publishedDate: normalizePublishedDate(r.date),
      }));
      const linkupImages = imageEntries.slice(0, MAX_IMAGE_HITS).map((r) => ({
        title: decodeHtmlEntities(r.name) || extractDomain(r.url) || 'Bild',
        url: r.url,
        domain: extractDomain(r.url),
      }));
      log.info(
        `[Direct Web Search] Linkup returned ${linkupFormatted.length} results${linkupImages.length > 0 ? ` + ${linkupImages.length} images` : ''} for "${query}"`
      );
      return {
        query,
        searchType,
        resultsCount: linkupFormatted.length,
        results: linkupFormatted,
        ...(linkupImages.length > 0 ? { images: linkupImages } : {}),
      };
    }

    const searchOptions: SearxngSearchOptions = {
      maxResults: Math.min(maxResults, 10),
      language,
      safesearch: 0,
      categories: searchType === 'news' ? 'news' : 'general',
      page: 1,
      ...(timeRange ? { time_range: timeRange } : {}),
    };

    const searchResults = await withRetry(
      () => searxngService.performWebSearch(query, searchOptions),
      { maxRetries: 1, delayMs: 500, label: 'DirectWebSearch' }
    );

    // Same split as the document search above: a SearXNG outage must not read
    // as "the web has nothing on this".
    if (!searchResults.success) {
      log.warn(`[Direct Web Search] Search failed for "${query}"`);
      return {
        query,
        searchType,
        resultsCount: 0,
        results: [],
        error: true,
        message: 'Die Websuche ist momentan gestört — es konnte nicht gesucht werden.',
      };
    }

    if (!searchResults.results || searchResults.results.length === 0) {
      log.info(`[Direct Web Search] No results found for: "${query}"`);
      return {
        query,
        searchType,
        resultsCount: 0,
        results: [],
        message: 'Keine Websuche-Ergebnisse gefunden.',
      };
    }

    const formattedResults = searchResults.results
      .slice(0, maxResults)
      .map((result: SearxngSearchResult) => ({
        rank: result.rank,
        title: result.title || 'Unbekannt',
        url: result.url,
        snippet: truncateText(result.content || result.snippet || '', 300),
        domain: result.domain || extractDomain(result.url),
        publishedDate: result.publishedDate || null,
      }));

    log.info(`[Direct Web Search] Found ${formattedResults.length} results for "${query}"`);

    return {
      query,
      searchType,
      resultsCount: formattedResults.length,
      results: formattedResults,
      suggestions: searchResults.suggestions?.slice(0, 3),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Direct Web Search] Error:`, errMsg);
    return {
      query,
      searchType,
      resultsCount: 0,
      results: [],
      error: true,
      message: `Websuche fehlgeschlagen: ${errMsg}`,
    };
  }
}

/**
 * Map a SearXNG-style `time_range` ("day"|"week"|"month"|"year") to a Linkup
 * `fromDate` (YYYY-MM-DD). Unknown values yield no constraint.
 */
/** ISO date (YYYY-MM-DD) `days` in the past. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Linkup's `date` field as something the recency ranking can use, or `null`.
 *
 * Returning `null` for anything unparseable is deliberate: a bogus date is worse
 * than a missing one, because the ranking would treat it as a real signal and
 * boost or bury a source on the strength of a string nobody validated. Future
 * dates are rejected for the same reason — a page dated next year is metadata
 * noise, not a fresh source.
 */
/**
 * Split Linkup's single result array into text hits and image hits.
 *
 * Classification is by exclusion, not by allow-list: anything NOT marked
 * `type: 'image'` counts as text. Linkup documents `text` and `image`, and a
 * hypothetical third type would still carry `content` — mapping it as text keeps
 * the source, while an allow-list would silently drop it. An entry claiming to be
 * an image but carrying no usable URL is dropped from both lists: a link is the
 * only thing we do with it.
 */
export function partitionLinkupResults(results: readonly LinkupSearchResult[]): {
  text: LinkupSearchResult[];
  images: LinkupSearchResult[];
} {
  const text: LinkupSearchResult[] = [];
  const images: LinkupSearchResult[] = [];
  for (const r of results) {
    if (r.type === 'image') {
      if (r.url && r.url.trim().length > 0) images.push(r);
      continue;
    }
    text.push(r);
  }
  return { text, images };
}

export function normalizePublishedDate(raw: string | undefined): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const parsed = new Date(raw);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  // One day of slack for timezone skew rather than an exact comparison.
  if (time > Date.now() + 24 * 60 * 60 * 1000) return null;
  return parsed.toISOString();
}

function timeRangeToFromDate(timeRange: string): string | undefined {
  const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  const offset = days[timeRange.toLowerCase()];
  if (!offset) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}
