/**
 * Direct Search Executors
 *
 * Provides direct Qdrant vector search, examples search, and web search
 * for chat tools, bypassing the MCP server. Reuses the existing
 * DocumentSearchService infrastructure.
 */

import { COLLECTION_MAP } from '../../../config/collectionMap.js';
import {
  getSearchParams,
  buildSubcategoryFilter,
  applyDefaultFilter,
  type SubcategoryFilters,
} from '../../../config/systemCollectionsConfig.js';
import { contentExamplesService } from '../../../services/contentExamplesService.js';
import { DocumentSearchService } from '../../../services/document-services/index.js';
import { withRetry } from '../../../services/search/index.js';
import { searxngService } from '../../../services/search/SearxngService.js';
import { createLogger } from '../../../utils/logger.js';

import { extractDomain, formatRelevance, truncateText } from './searchFormatting.js';

import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';

const log = createLogger('DirectSearch');

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
  suggestions?: string[];
  error?: boolean;
  message?: string;
}

const documentSearchService = new DocumentSearchService();

/**
 * Execute a direct document search against Qdrant.
 * Replaces the MCP tool call for gruenerator_search.
 */
export async function executeDirectSearch(params: {
  query: string;
  collection?: string;
  limit?: number;
  filters?: SubcategoryFilters;
}): Promise<DirectSearchResult> {
  const { query, collection = 'deutschland', limit = 5, filters } = params;

  log.info(
    `[Direct Search] query="${query}" collection="${collection}" limit=${limit}${filters ? ` filters=${JSON.stringify(filters)}` : ''}`
  );

  const mapping = COLLECTION_MAP[collection];
  if (!mapping) {
    log.warn(`[Direct Search] Unknown collection: ${collection}, falling back to deutschland`);
  }

  const { qdrantCollection, systemId } = mapping || COLLECTION_MAP.deutschland;
  const searchParams = getSearchParams(systemId);

  // Build filter: merge collection default filter with user-detected filters
  const collectionDefault = applyDefaultFilter(systemId);
  const userFilter = buildSubcategoryFilter(filters);
  let additionalFilter: QdrantFilter | undefined;

  if (collectionDefault && userFilter) {
    // Merge both must arrays
    const mergedMust = [...(collectionDefault.must || []), ...(userFilter.must || [])];
    additionalFilter = {
      must: mergedMust as QdrantFilter['must'],
    };
  } else {
    additionalFilter = userFilter || collectionDefault;
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

      if (!response.success || !response.results || response.results.length === 0) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedResults = response.results.slice(0, limit).map((result: any, index: number) => ({
      rank: index + 1,
      relevance: formatRelevance(result.score || result.similarity || 0),
      source: result.title || result.document_title || 'Unbekannte Quelle',
      url: result.source_url || result.url || undefined,
      excerpt: truncateText(
        result.relevant_content ||
          result.top_chunks?.[0]?.preview ||
          result.snippet ||
          result.chunk_text ||
          result.content ||
          '',
        800
      ),
      searchMethod: result.searchMethod || 'hybrid',
      contentType: result.top_chunks?.[0]?.content_type || result.content_type || undefined,
      documentId: result.document_id || undefined,
      ...(result.chunk_index != null || result.top_chunks?.[0]?.chunk_index != null
        ? { chunkIndex: result.chunk_index ?? result.top_chunks?.[0]?.chunk_index }
        : {}),
      score: result.score || result.similarity || result.similarity_score || undefined,
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
}): Promise<DirectExamplesResult> {
  const { query, platform, country } = params;

  const countryInfo = country ? ` country="${country}"` : '';
  log.info(
    `[Direct Examples Search] query="${query}" platform="${platform || 'all'}"${countryInfo}`
  );

  try {
    const results = await contentExamplesService.searchSocialMediaExamples(query, {
      platform: platform as 'facebook' | 'instagram' | null,
      limit: 10,
      threshold: 0.15,
      country: country || null,
    });

    if (!results || results.length === 0) {
      log.info(`[Direct Examples Search] No examples found, trying random examples`);

      const randomResults = await contentExamplesService.getRandomSocialMediaExamples({
        platform: platform as 'facebook' | 'instagram' | null,
        limit: 5,
        country: country || null,
      });

      if (!randomResults || randomResults.length === 0) {
        return {
          resultsCount: 0,
          examples: [],
          message: 'Keine Beispiele gefunden.',
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const examples = randomResults.map((result: any) => ({
        id: String(result.id),
        platform: result.platform || platform || 'unknown',
        content: truncateText(result.content || '', 500),
        ...(result.source_account && { author: result.source_account }),
        ...(result.created_at && { date: result.created_at }),
      }));

      log.info(`[Direct Examples Search] Found ${examples.length} random examples`);
      return {
        resultsCount: examples.length,
        examples,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const examples = results.map((result: any) => ({
      id: String(result.id),
      platform: result.platform || platform || 'unknown',
      content: truncateText(result.content || '', 500),
      ...(result.source_account && { author: result.source_account }),
      ...(result.created_at && { date: result.created_at }),
    }));

    log.info(`[Direct Examples Search] Found ${examples.length} examples`);

    return {
      resultsCount: examples.length,
      examples,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Direct Examples Search] Error:`, errMsg);
    return {
      resultsCount: 0,
      examples: [],
      error: true,
      message: `Beispielsuche fehlgeschlagen: ${errMsg}`,
    };
  }
}

/**
 * Execute a web search using SearXNG.
 * Provides access to current web content for queries about recent events or
 * topics not covered in the document collections.
 */
export async function executeDirectWebSearch(params: {
  query: string;
  searchType?: 'general' | 'news';
  maxResults?: number;
  timeRange?: string;
}): Promise<DirectWebSearchResult> {
  const { query, searchType = 'general', maxResults = 5, timeRange } = params;

  log.info(`[Direct Web Search] query="${query}" type="${searchType}" max=${maxResults}`);

  try {
    const searchOptions: Record<string, unknown> = {
      maxResults: Math.min(maxResults, 10),
      language: 'de-DE',
      safesearch: 0,
      categories: searchType === 'news' ? 'news' : 'general',
      page: 1,
    };

    if (timeRange) {
      searchOptions.time_range = timeRange;
    }

    const searchResults = await withRetry(
      () => searxngService.performWebSearch(query, searchOptions),
      { maxRetries: 1, delayMs: 500, label: 'DirectWebSearch' }
    );

    if (!searchResults.success || !searchResults.results || searchResults.results.length === 0) {
      log.info(`[Direct Web Search] No results found for: "${query}"`);
      return {
        query,
        searchType,
        resultsCount: 0,
        results: [],
        message: 'Keine Websuche-Ergebnisse gefunden.',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedResults = searchResults.results.slice(0, maxResults).map((result: any) => ({
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
