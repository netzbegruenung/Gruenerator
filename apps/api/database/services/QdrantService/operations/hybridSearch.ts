/**
 * Hybrid Search Operations
 * Combines vector and text search with various fusion methods
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { vectorConfig } from '../../../../config/vectorConfig.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  generateQueryVariants,
  normalizeQuery,
  tokenizeQuery,
} from '../../../../services/text/index.js';
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
          filter: textFilter,
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
              filter: tokFilter,
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
 * Apply weighted combination to merge vector and text results
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
    .map((result) => ({
      id: result.item.id,
      score: result.vectorScore + result.textScore,
      payload: result.item.payload,
      searchMethod: result.searchMethod,
      originalVectorScore: result.originalVectorScore,
      originalTextScore: result.originalTextScore,
    }))
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
