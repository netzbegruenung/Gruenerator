/**
 * HybridSearch - Core hybrid search algorithms
 * Combines vector and text search using RRF or weighted fusion
 */

import type { VectorSearchResult, TextSearchResult, HybridConfig } from './types.js';
import {
  DEFAULT_HYBRID_CONFIG,
  RRF_K,
  WEIGHTED_FUSION_DEFAULTS,
  MIN_TEXT_RESULTS_FOR_RRF,
} from './constants.js';

interface RRFScoreEntry {
  item: VectorSearchResult | TextSearchResult;
  rrfScore: number;
  vectorRank: number | null;
  textRank: number | null;
  originalVectorScore: number | null;
  originalTextScore: number | null;
  searchMethod: 'vector' | 'text' | 'hybrid';
  confidence: number;
}

interface WeightedScoreEntry {
  item: VectorSearchResult | TextSearchResult;
  vectorScore: number;
  textScore: number;
  originalVectorScore: number | null;
  originalTextScore: number | null;
  searchMethod: 'vector' | 'text' | 'hybrid';
}

/**
 * Apply Reciprocal Rank Fusion to combine vector and text results
 */
export function applyReciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  limit: number,
  k: number = RRF_K,
  config: HybridConfig = DEFAULT_HYBRID_CONFIG
): VectorSearchResult[] {
  const scoresMap = new Map<string | number, RRFScoreEntry>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scoresMap.set(result.id, {
      item: result,
      rrfScore,
      vectorRank: index + 1,
      textRank: null,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
      confidence: config.enableConfidenceWeighting ? config.confidencePenalty : 1.0,
    });
  });

  // Process text results
  textResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    const key = result.id;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key)!;
      existing.rrfScore += rrfScore;
      existing.textRank = index + 1;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
      existing.confidence = config.enableConfidenceWeighting ? config.confidenceBoost : 1.0;
    } else {
      scoresMap.set(key, {
        item: result,
        rrfScore,
        vectorRank: null,
        textRank: index + 1,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
        confidence: 1.0,
      });
    }
  });

  // Apply confidence weighting and sort by final score
  return Array.from(scoresMap.values())
    .map((entry) => ({
      ...entry,
      finalScore: entry.rrfScore * entry.confidence,
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map((entry) => ({
      ...(entry.item as VectorSearchResult),
      score: entry.finalScore,
      searchMethod: entry.searchMethod,
      originalVectorScore: entry.originalVectorScore,
      originalTextScore: entry.originalTextScore,
    })) as VectorSearchResult[];
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
): VectorSearchResult[] {
  const scoresMap = new Map<string | number, WeightedScoreEntry>();

  // Normalize weights
  const totalWeight = vectorWeight + textWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;
  const normalizedTextWeight = textWeight / totalWeight;

  // Process vector results
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

  // Process text results
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
        textScore,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
      });
    }
  });

  // Calculate combined scores and sort
  return Array.from(scoresMap.values())
    .map((entry) => ({
      ...(entry.item as VectorSearchResult),
      score: entry.vectorScore + entry.textScore,
      searchMethod: entry.searchMethod,
      originalVectorScore: entry.originalVectorScore,
      originalTextScore: entry.originalTextScore,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit) as VectorSearchResult[];
}

/**
 * Apply quality gate to filter out low-quality results after fusion
 */
export function applyQualityGate(
  results: VectorSearchResult[],
  hasTextMatches: boolean,
  config: HybridConfig = DEFAULT_HYBRID_CONFIG
): VectorSearchResult[] {
  if (!config.enableQualityGate || !results || results.length === 0) {
    return results;
  }

  return results.filter((result) => {
    if (result.score < config.minFinalScore) {
      return false;
    }

    if (result.searchMethod === 'vector' && !hasTextMatches) {
      if (result.score < config.minVectorOnlyFinalScore) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Calculate dynamic threshold based on text match presence
 */
export function calculateDynamicThreshold(
  baseThreshold: number,
  hasTextMatches: boolean,
  config: HybridConfig = DEFAULT_HYBRID_CONFIG
): number {
  if (!config.enableDynamicThresholds) {
    return baseThreshold;
  }

  if (hasTextMatches) {
    return Math.max(baseThreshold, config.minVectorWithTextThreshold);
  } else {
    return Math.max(baseThreshold, config.minVectorOnlyThreshold);
  }
}

/**
 * Determine fusion method and weights based on text results
 */
export function determineFusionStrategy(
  textResults: TextSearchResult[],
  preferRRF: boolean = true
): {
  useRRF: boolean;
  vectorWeight: number;
  textWeight: number;
} {
  const hasRealTextMatches = textResults.some(
    (r) => r.matchType && r.matchType !== 'token_fallback'
  );

  // Conditions to switch from RRF to weighted
  if (!hasRealTextMatches && textResults.length > 0 && preferRRF) {
    return {
      useRRF: false,
      vectorWeight: WEIGHTED_FUSION_DEFAULTS.vectorOnlyWeight,
      textWeight: WEIGHTED_FUSION_DEFAULTS.textOnlyWeight,
    };
  }

  if (textResults.length === 0 && preferRRF) {
    return {
      useRRF: false,
      vectorWeight: WEIGHTED_FUSION_DEFAULTS.vectorOnlyWeight,
      textWeight: WEIGHTED_FUSION_DEFAULTS.textOnlyWeight,
    };
  }

  if (preferRRF && textResults.length < MIN_TEXT_RESULTS_FOR_RRF) {
    return {
      useRRF: false,
      vectorWeight: WEIGHTED_FUSION_DEFAULTS.vectorOnlyWeight,
      textWeight: WEIGHTED_FUSION_DEFAULTS.textOnlyWeight,
    };
  }

  // Use RRF with default weights
  return {
    useRRF: preferRRF,
    vectorWeight: WEIGHTED_FUSION_DEFAULTS.vectorWeight,
    textWeight: WEIGHTED_FUSION_DEFAULTS.textWeight,
  };
}

/**
 * Apply quality-weighted scoring boost based on chunk quality
 */
export function applyQualityBoost(
  results: VectorSearchResult[],
  boostFactor: number = 1.2
): VectorSearchResult[] {
  return results.map((result) => {
    const qualityScore = result.qualityScore ?? (result.payload?.quality_score as number) ?? 1.0;
    const qualityBoost = 1 + (qualityScore - 0.5) * (boostFactor - 1);

    return {
      ...result,
      score: result.score * qualityBoost,
    };
  });
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

  // Count matches
  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = (lowerText.match(new RegExp(escapedTerm, 'g')) || []).length;
  let score = Math.min(matches * 0.1, 0.8);

  // Position penalty
  const positionPenalty = Math.max(0.1, 1 - position * 0.1);
  score *= positionPenalty;

  // Length normalization
  const lengthNormalization = Math.min(1, searchTerm.length / 10);
  score *= lengthNormalization;

  return Math.min(1.0, Math.max(0.1, score));
}
