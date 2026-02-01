/**
 * Vector Search Operations
 * Basic and quality-aware vector similarity search
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { vectorConfig } from '../../../../config/vectorConfig.js';
import { createLogger } from '../../../../utils/logger.js';

import { mergeFilters } from './filterUtils.js';

import type {
  VectorSearchOptions,
  VectorSearchResult,
  QualityConfig,
  QdrantFilter,
} from './types.js';

const logger = createLogger('QdrantOperations:vectorSearch');

/**
 * Perform vector similarity search
 */
export async function vectorSearch(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  filter: QdrantFilter = {},
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const {
    limit = 10,
    threshold = 0.3,
    withPayload = true,
    withVector = false,
    ef = null,
  } = options;

  try {
    // Strip intent-based `should` clauses (content_type, lang preferences).
    // In Qdrant, `should` combined with `must` requires at least one `should` to match,
    // turning soft preferences into hard filters. This caused 0 results on collections
    // with different content_type values (e.g. Hamburg's "beschluss" docs).
    let sanitizedFilter = filter;
    const hasShould = Array.isArray(filter.should) && filter.should.length > 0;

    if (hasShould) {
      const intentOnlyKeys = new Set(['content_type', 'lang']);
      const allIntentBased = filter.should!.every(
        (clause) => 'key' in clause && intentOnlyKeys.has((clause as { key: string }).key)
      );
      if (allIntentBased) {
        logger.debug('Stripping intent-based should clauses to prevent 0-result filtering');
        const { should: _stripped, ...rest } = filter;
        sanitizedFilter = rest;
      }
    }

    const searchOptions = {
      vector: queryVector,
      filter: Object.keys(sanitizedFilter).length > 0 ? sanitizedFilter : undefined,
      limit: limit,
      score_threshold: threshold,
      with_payload: withPayload,
      with_vector: withVector,
      params: ef && ef > 0 ? { ef } : undefined,
    };

    logger.info(
      `DEBUG - collection: ${collection}, vectorLen: ${queryVector?.length}, threshold: ${threshold}, limit: ${limit}`
    );
    logger.info(`DEBUG - filter: ${JSON.stringify(sanitizedFilter)}`);

    const results = await client.search(collection, searchOptions);

    // If no results, try without threshold to see if it's a threshold issue
    if (results.length === 0) {
      const noThresholdResults = await client.search(collection, {
        ...searchOptions,
        score_threshold: 0.0,
        limit: 3,
      });
      if (noThresholdResults.length > 0) {
        logger.warn(
          `DEBUG - Found ${noThresholdResults.length} results WITHOUT threshold! Top scores: ${noThresholdResults.map((r) => r.score.toFixed(4)).join(', ')}`
        );
        logger.warn(`DEBUG - Threshold ${threshold} is filtering out all results!`);
      } else {
        logger.warn(
          `DEBUG - No results even without threshold - possible embedding mismatch or empty collection`
        );
      }
    }

    logger.info(
      `Vector search: ${results.length} results, top score: ${results[0]?.score.toFixed(3) || 'none'}`
    );

    return results.map((hit) => ({
      id: hit.id,
      score: hit.score,
      payload: (hit.payload as Record<string, unknown>) || {},
      vector: (hit.vector as number[]) || null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Vector search failed: ${message}`);
    throw new Error(`Vector search failed: ${message}`);
  }
}

/**
 * Vector search with quality-aware filtering and boosting
 */
export async function searchWithQuality(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  filter: QdrantFilter = {},
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const qualityCfg = vectorConfig.get('quality') as QualityConfig;
  const retrievalCfg = qualityCfg?.retrieval || {};

  const results = await vectorSearch(client, collection, queryVector, filter, options);

  // Apply quality filter if enabled
  let filtered = results;
  if (retrievalCfg.enableQualityFilter) {
    const minQ = retrievalCfg.minRetrievalQuality ?? 0.4;
    filtered = results.filter((r) => {
      const q = r?.payload?.quality_score;
      return typeof q === 'number' ? q >= minQ : true;
    });
  }

  // Apply quality-based re-ranking/boosting
  const boost = retrievalCfg.qualityBoostFactor ?? 1.2;
  const rescored = filtered
    .map((r) => {
      const q =
        typeof r?.payload?.quality_score === 'number' ? (r.payload.quality_score as number) : 1.0;
      return { ...r, score: r.score * (1 + (q - 0.5) * (boost - 1)) };
    })
    .sort((a, b) => b.score - a.score);

  const limit = options.limit || 10;
  return rescored.slice(0, limit);
}

/**
 * Intent-aware vector search. Merges base filter with intent-based preferences.
 */
export async function searchWithIntent(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  intent: { type: string; language: string; filter?: QdrantFilter } | null,
  baseFilter: QdrantFilter = {},
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const merged = mergeFilters(baseFilter, intent?.filter || {});

  // If caller passed full intent object, generate filter structure dynamically
  if (!intent?.filter && intent) {
    try {
      // Dynamic import with type safety bypass for cross-module compatibility
      const module =
        (await import('../../../../services/QueryIntentService/QueryIntentService.js')) as {
          QueryIntentService: new () => { generateSearchFilters(intent: unknown): QdrantFilter };
        };
      const svc = new module.QueryIntentService();
      const f = svc.generateSearchFilters(intent as unknown);
      return await searchWithQuality(
        client,
        collection,
        queryVector,
        mergeFilters(baseFilter, f),
        options
      );
    } catch {
      // If service not available, just fall back to quality search with base filter
      return await searchWithQuality(client, collection, queryVector, baseFilter, options);
    }
  }

  return await searchWithQuality(client, collection, queryVector, merged, options);
}
