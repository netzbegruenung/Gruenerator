/**
 * Hybrid Search Operations
 * Combines vector and text search with various fusion methods
 */

import { type QdrantClient, type Schemas } from '@qdrant/js-client-rest';

import { BM25_SPARSE_VECTOR_NAME } from '../../../../config/qdrantCollectionsSchema.js';
import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  encodeBm25Query,
  generateQueryVariants,
  normalizeQuery,
  tokenizeQuery,
} from '../../../../services/text/index.js';
import { createLogger } from '../../../../utils/logger.js';

import { collectionSupportsBm25 } from './batchOperations.js';
import { vectorSearch } from './vectorSearch.js';

import type {
  HybridSearchOptions,
  HybridSearchResponse,
  HybridSearchResult,
  VectorSearchResult,
  TextSearchResult,
  HybridConfig,
  RRFScoringItem,
  WeightedScoringItem,
  VariantSearchResult,
  QdrantFilter,
} from './types.js';

const logger = createLogger('QdrantOperations:hybridSearch');

/**
 * Get hybrid config from vectorConfig
 */
function getHybridConfig(): HybridConfig {
  return vectorConfig.get('hybrid') as HybridConfig;
}

/**
 * Perform hybrid search combining vector and keyword search
 */
export async function hybridSearch(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  query: string,
  filter: QdrantFilter = {},
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const hybridCfg = getHybridConfig();
  const {
    limit = 10,
    threshold = 0.3,
    vectorWeight = 0.7,
    textWeight = 0.3,
    useRRF = true,
    rrfK = 60,
    recallLimit,
  } = options;

  try {
    logger.debug(`Hybrid search - vector weight: ${vectorWeight}, text weight: ${textWeight}`);

    // Server-side hybrid via Query API (dense + BM25 sparse, RRF fusion) for
    // migrated collections. Legacy client-side scroll fusion remains the
    // fallback for collections that don't declare the sparse vector yet.
    if (await collectionSupportsBm25(client, collection)) {
      const serverResult = await hybridSearchServerSide(
        client,
        collection,
        queryVector,
        query,
        filter,
        { limit, threshold, recallLimit: recallLimit ?? null },
        hybridCfg
      );
      if (serverResult) return serverResult;
      logger.debug('Server-side hybrid unavailable for this query - using legacy fusion');
    }

    const recallText = Math.max(limit, recallLimit || limit * 4);
    const textResults = await performTextSearch(client, collection, query, filter, recallText);

    const dynamicThreshold = hybridCfg.enableDynamicThresholds
      ? calculateDynamicThreshold(threshold, textResults.length > 0, hybridCfg)
      : threshold;

    logger.debug(
      `Using dynamic threshold: ${dynamicThreshold} (text matches: ${textResults.length})`
    );

    const recallVec = Math.max(limit, Math.round((recallLimit || limit * 4) * 1.5));
    const vectorResults = await vectorSearch(client, collection, queryVector, filter, {
      limit: recallVec,
      threshold: dynamicThreshold,
      withPayload: true,
      ef: Math.max(100, recallVec * 2),
    });

    logger.info(`Vector: ${vectorResults.length} results, Text: ${textResults.length} results`);

    let shouldUseRRF = useRRF;
    let vW = vectorWeight;
    let tW = textWeight;

    const hasRealTextMatches = textResults.some(
      (r) => r.matchType && r.matchType !== 'token_fallback'
    );

    if (!hasRealTextMatches && textResults.length > 0 && useRRF) {
      logger.debug(
        `Only token fallback matches found (${textResults.length} results) - switching from RRF to weighted fusion`
      );
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (textResults.length === 0 && useRRF) {
      logger.debug('Text search failed (0 results) - switching from RRF to weighted fusion');
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (useRRF && textResults.length < 3) {
      logger.debug(
        `Too few text results (${textResults.length}) for effective RRF - switching to weighted fusion`
      );
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (!useRRF) {
      if (textResults.length === 0 || !hasRealTextMatches) {
        vW = 0.85;
        tW = 0.15;
      } else {
        vW = 0.5;
        tW = 0.5;
      }
      logger.debug(`Dynamic weights applied: vectorWeight=${vW}, textWeight=${tW}`);
    }

    let combinedResults = shouldUseRRF
      ? applyReciprocalRankFusion(vectorResults, textResults, limit, rrfK, hybridCfg)
      : applyWeightedCombination(vectorResults, textResults, vW, tW, limit);

    if (hybridCfg.enableQualityGate) {
      combinedResults = applyQualityGate(combinedResults, textResults.length > 0, hybridCfg);
    }

    return {
      success: true,
      results: combinedResults,
      metadata: {
        vectorResults: vectorResults.length,
        textResults: textResults.length,
        fusionMethod: shouldUseRRF ? 'RRF' : 'weighted',
        vectorWeight: vW,
        textWeight: tW,
        dynamicThreshold,
        qualityFiltered: hybridCfg.enableQualityGate,
        autoSwitchedFromRRF: useRRF && !shouldUseRRF,
        hasRealTextMatches: hasRealTextMatches,
        textMatchTypes: Array.from(
          new Set(textResults.map((r) => r.matchType).filter(Boolean))
        ) as string[],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Hybrid search failed: ${message}`);
    throw new Error(`Hybrid search failed: ${message}`);
  }
}

/**
 * Server-side hybrid search: one Query API round trip with a dense and a BM25
 * sparse prefetch, fused via RRF in Qdrant. Replaces the client-side
 * scroll+TF-heuristic fusion for collections that declare the sparse vector.
 * Returns null when the query yields no sparse terms (stopwords only) so the
 * caller can fall back to the legacy path.
 */
async function hybridSearchServerSide(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  query: string,
  filter: QdrantFilter,
  opts: { limit: number; threshold: number; recallLimit: number | null },
  hybridCfg: HybridConfig
): Promise<HybridSearchResponse | null> {
  const sparseQuery = encodeBm25Query(query);
  if (sparseQuery.indices.length === 0) return null;

  const { limit, threshold, recallLimit } = opts;
  const recall = Math.max(limit, recallLimit || limit * 4);
  const hasFilter = Boolean(filter.must?.length || filter.should?.length || filter.must_not);
  const prefetchFilter = hasFilter ? (filter as Schemas['Filter']) : undefined;

  const prefetch: Schemas['Prefetch'][] = [
    {
      query: queryVector,
      using: '',
      limit: recall,
      score_threshold: threshold,
      params: { hnsw_ef: Math.max(100, recall * 2) },
      ...(prefetchFilter && { filter: prefetchFilter }),
    },
    {
      query: { indices: sparseQuery.indices, values: sparseQuery.values },
      using: BM25_SPARSE_VECTOR_NAME,
      limit: recall,
      ...(prefetchFilter && { filter: prefetchFilter }),
    },
  ];

  const response = await client.query(collection, {
    prefetch,
    query: { fusion: 'rrf' },
    limit: recall,
    with_payload: true,
  });

  // Qdrant's server-side RRF scores are HIGHER than the legacy client-side
  // 1/(60+rank) domain (measured: rank 1 in both lists ≈ 1.0). The quality
  // gate's minFinalScore was tuned for the lower legacy domain, so it only
  // ever filters less here — never more — and stays safe to apply.
  let results: HybridSearchResult[] = response.points.map((point) => ({
    id: point.id,
    score: point.score,
    payload: (point.payload as Record<string, unknown>) || {},
    searchMethod: 'hybrid' as const,
    originalVectorScore: null,
    originalTextScore: null,
  }));

  if (hybridCfg.enableQualityGate) {
    results = applyQualityGate(results, true, hybridCfg);
  }
  results = results.slice(0, limit);

  logger.info(
    `Server-side hybrid (rrf): ${results.length}/${response.points.length} results for "${query}"`
  );

  return {
    success: true,
    results,
    metadata: {
      vectorResults: -1,
      textResults: -1,
      fusionMethod: 'rrf-server',
      vectorWeight: 0.5,
      textWeight: 0.5,
      dynamicThreshold: threshold,
      qualityFiltered: hybridCfg.enableQualityGate,
      autoSwitchedFromRRF: false,
      hasRealTextMatches: true,
      textMatchTypes: ['bm25'],
    },
  };
}

/**
 * Perform text-based search using Qdrant's scroll API with multi-variant support
 */
export async function performTextSearch(
  client: QdrantClient,
  collection: string,
  searchTerm: string,
  baseFilter: QdrantFilter = {},
  limit: number = 10
): Promise<TextSearchResult[]> {
  try {
    logger.debug(`Text search: "${searchTerm}" in collection "${collection}"`);

    const variants = generateQueryVariants(searchTerm);
    logger.debug(`Generated ${variants.length} query variants: ${variants.join(', ')}`);

    const variantSearchPromises = variants.map(async (variant): Promise<VariantSearchResult> => {
      const textFilter: QdrantFilter = {
        must: [...(baseFilter.must || [])],
      };
      textFilter.must!.push({
        key: 'chunk_text',
        match: { text: variant },
      });

      try {
        const scrollResult = await client.scroll(collection, {
          filter: textFilter as Schemas['Filter'],
          limit: Math.ceil(limit / variants.length) + 5,
          with_payload: true,
          with_vector: false,
        });
        return {
          variant,
          points: (scrollResult.points || []).map((p) => ({
            id: p.id,
            payload: (p.payload as Record<string, unknown>) || {},
          })),
          matchType: variant === searchTerm.toLowerCase() ? 'exact' : 'variant',
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Variant search failed for "${variant}": ${message}`);
        return { variant, points: [], matchType: 'error' };
      }
    });

    const variantResults = await Promise.all(variantSearchPromises);

    const seen = new Map<
      string | number,
      {
        point: { id: string | number; payload: Record<string, unknown> };
        variant: string;
        matchType: string;
      }
    >();
    let bestMatchType = 'variant';

    for (const result of variantResults) {
      if (result.points.length > 0 && result.matchType === 'exact') {
        bestMatchType = 'exact';
      }
      for (const point of result.points) {
        if (!seen.has(point.id)) {
          seen.set(point.id, { point, variant: result.variant, matchType: result.matchType });
        }
      }
    }

    let mergedPoints = Array.from(seen.values());
    let matchType = mergedPoints.length > 0 ? bestMatchType : 'none';

    logger.debug(
      `Variant search found ${mergedPoints.length} unique points from ${variants.length} variants`
    );

    // Token fallback if no results
    if (mergedPoints.length === 0) {
      const normalizedTerm = normalizeQuery(searchTerm);
      const tokens = tokenizeQuery(normalizedTerm || searchTerm).filter((t) => t.length >= 4);
      if (tokens.length > 1) {
        logger.debug(`Token fallback for terms: ${tokens.join(', ')}`);
        const tokenSearchPromises = tokens.map(async (tok) => {
          const tokFilter: QdrantFilter = { must: [...(baseFilter.must || [])] };
          tokFilter.must!.push({ key: 'chunk_text', match: { text: tok } });
          try {
            const tokRes = await client.scroll(collection, {
              filter: tokFilter as Schemas['Filter'],
              limit: Math.ceil(limit / tokens.length) + 3,
              with_payload: true,
              with_vector: false,
            });
            return (tokRes.points || []).map((p) => ({
              id: p.id,
              payload: (p.payload as Record<string, unknown>) || {},
            }));
          } catch {
            return [];
          }
        });

        const tokenResults = await Promise.all(tokenSearchPromises);
        const tokenSeen = new Map<
          string | number,
          {
            point: { id: string | number; payload: Record<string, unknown> };
            variant: string;
            matchType: string;
          }
        >();
        for (const points of tokenResults) {
          for (const p of points) {
            if (!tokenSeen.has(p.id)) {
              tokenSeen.set(p.id, { point: p, variant: 'token', matchType: 'token_fallback' });
            }
          }
        }
        mergedPoints = Array.from(tokenSeen.values());
        if (mergedPoints.length > 0) matchType = 'token_fallback';
        logger.debug(`Token OR fallback found: ${mergedPoints.length} unique points`);
      }
    }

    if (mergedPoints.length > 0) {
      logger.debug(`Text search matches found: ${mergedPoints.length}`);
    } else {
      logger.debug(`No text matches found for "${searchTerm}"`);
    }

    const results: TextSearchResult[] = mergedPoints.map(({ point, variant }, index) => ({
      id: point.id,
      score: calculateTextSearchScore(searchTerm, point.payload.chunk_text as string, index),
      payload: point.payload,
      searchMethod: 'text' as const,
      searchTerm: searchTerm,
      matchedVariant: variant,
      matchType: matchType as TextSearchResult['matchType'],
    }));

    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, limit);

    logger.debug(
      `Text search returning ${limitedResults.length} processed results (matchType: ${matchType})`
    );
    return limitedResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Text search failed for "${searchTerm}": ${message}`);
    return [];
  }
}

/**
 * Calculate text search score based on term frequency and position
 */
export function calculateTextSearchScore(
  searchTerm: string,
  text: string | undefined,
  position: number
): number {
  if (!text || !searchTerm) return 0.1;

  const lowerText = text.toLowerCase();
  const lowerTerm = searchTerm.toLowerCase();

  const matches = (
    lowerText.match(new RegExp(lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
  ).length;
  let score = Math.min(matches * 0.1, 0.8);

  const positionPenalty = Math.max(0.1, 1 - position * 0.1);
  score *= positionPenalty;

  const lengthNormalization = Math.min(1, searchTerm.length / 10);
  score *= lengthNormalization;

  return Math.min(1.0, Math.max(0.1, score));
}

/**
 * Calculate dynamic threshold based on text match presence
 */
export function calculateDynamicThreshold(
  baseThreshold: number,
  hasTextMatches: boolean,
  hybridCfg: HybridConfig
): number {
  if (!hybridCfg.enableDynamicThresholds) {
    return baseThreshold;
  }

  if (hasTextMatches) {
    return Math.max(baseThreshold, hybridCfg.minVectorWithTextThreshold);
  } else {
    return Math.max(baseThreshold, hybridCfg.minVectorOnlyThreshold);
  }
}

/**
 * Apply Reciprocal Rank Fusion to combine vector and text results
 */
export function applyReciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  limit: number,
  k: number = 60,
  hybridCfg: HybridConfig
): HybridSearchResult[] {
  const scoresMap = new Map<string | number, RRFScoringItem>();

  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scoresMap.set(result.id, {
      item: result,
      rrfScore: rrfScore,
      vectorRank: index + 1,
      textRank: null,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
      confidence: hybridCfg.enableConfidenceWeighting ? hybridCfg.confidencePenalty : 1.0,
    });
  });

  textResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    const key = result.id;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key)!;
      existing.rrfScore += rrfScore;
      existing.textRank = index + 1;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
      existing.confidence = hybridCfg.enableConfidenceWeighting ? hybridCfg.confidenceBoost : 1.0;
    } else {
      scoresMap.set(key, {
        item: result,
        rrfScore: rrfScore,
        vectorRank: null,
        textRank: index + 1,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
        confidence: 1.0,
      });
    }
  });

  return Array.from(scoresMap.values())
    .map((result) => ({
      ...result,
      finalScore: result.rrfScore * result.confidence,
    }))
    .sort((a, b) => b.finalScore! - a.finalScore!)
    .slice(0, limit)
    .map((result) => ({
      id: result.item.id,
      score: result.finalScore!,
      payload: result.item.payload,
      searchMethod: result.searchMethod,
      originalVectorScore: result.originalVectorScore,
      originalTextScore: result.originalTextScore,
      confidence: result.confidence,
      rawRRFScore: result.rrfScore,
    }));
}

/**
 * Apply weighted combination to merge vector and text results.
 *
 * A chunk that only the vector lane found is scored on the vector weight ALONE
 * (weighted average), not on the full weight sum. Otherwise its score is scaled
 * down by the missing text weight and it has to clear the caller's threshold
 * from behind a handicap that varies with the query's wording — with
 * `vectorWeight` 0.5 a threshold of 0.35 silently means cosine 0.70, with 0.85
 * it means cosine 0.41. Same chunk, same collection, different phrasing.
 *
 * The asymmetry with text-only chunks (still scaled by the text weight) is
 * deliberate: the two absences carry different information. The vector lane
 * ranks the whole collection, so a missing text hit only means the chunk lacks
 * the literal term — no evidence against it. The text lane is a filter, so a
 * missing vector hit means the chunk WAS scored and fell below the threshold —
 * that is evidence against it, and keeps its penalty.
 */
export function applyWeightedCombination(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  vectorWeight: number,
  textWeight: number,
  limit: number
): HybridSearchResult[] {
  const scoresMap = new Map<string | number, WeightedScoringItem>();

  const totalWeight = vectorWeight + textWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;
  const normalizedTextWeight = textWeight / totalWeight;

  vectorResults.forEach((result) => {
    scoresMap.set(result.id, {
      item: result,
      vectorScore: result.score * normalizedVectorWeight,
      textScore: 0,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
    });
  });

  textResults.forEach((result) => {
    const key = result.id;
    const textScore = result.score * normalizedTextWeight;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key)!;
      existing.textScore = textScore;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
    } else {
      scoresMap.set(key, {
        item: result,
        vectorScore: 0,
        textScore: textScore,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
      });
    }
  });

  return Array.from(scoresMap.values())
    .map((result) => {
      const hasVector = result.originalVectorScore !== null;
      const hasText = result.originalTextScore !== null;
      // Divide by the weight of the lanes that actually contributed, so a
      // vector-only hit keeps its cosine instead of being scaled by a weight
      // that the caller's threshold knows nothing about.
      const contributingWeight =
        hasVector && !hasText
          ? normalizedVectorWeight
          : normalizedVectorWeight + normalizedTextWeight;

      return {
        id: result.item.id,
        score: (result.vectorScore + result.textScore) / (contributingWeight || 1),
        payload: result.item.payload,
        searchMethod: result.searchMethod,
        originalVectorScore: result.originalVectorScore,
        originalTextScore: result.originalTextScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Apply quality gate to filter out low-quality results after fusion
 */
export function applyQualityGate(
  results: HybridSearchResult[],
  hasTextMatches: boolean,
  hybridCfg: HybridConfig
): HybridSearchResult[] {
  if (!hybridCfg.enableQualityGate || !results || results.length === 0) {
    return results;
  }

  logger.debug(
    `Quality gate: filtering ${results.length} results (hasTextMatches: ${hasTextMatches})`
  );

  if (results.length > 0) {
    const scores = results.map((r) => r.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    logger.debug(
      `Score distribution: min=${minScore.toFixed(6)}, max=${maxScore.toFixed(6)}, avg=${avgScore.toFixed(6)}`
    );
  }

  const filteredResults = results.filter((result) => {
    if (result.score < hybridCfg.minFinalScore) {
      return false;
    }

    if (result.searchMethod === 'vector' && !hasTextMatches) {
      if (result.score < hybridCfg.minVectorOnlyFinalScore) {
        return false;
      }
    }

    return true;
  });

  const removedCount = results.length - filteredResults.length;
  logger.debug(
    `Quality gate: kept ${filteredResults.length}/${results.length}${removedCount > 0 ? `, removed ${removedCount}` : ''}`
  );

  return filteredResults;
}
