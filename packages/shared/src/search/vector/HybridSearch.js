/**
 * HybridSearch - Core hybrid search algorithms
 * Combines vector and text search using RRF or weighted fusion
 */

import {
  DEFAULT_HYBRID_CONFIG,
  RRF_K,
  WEIGHTED_FUSION_DEFAULTS,
  MIN_TEXT_RESULTS_FOR_RRF,
} from './constants.js';

/**
 * Apply Reciprocal Rank Fusion to combine vector and text results
 * @param {Array} vectorResults - Results from vector search
 * @param {Array} textResults - Results from text search
 * @param {number} limit - Maximum results to return
 * @param {number} k - RRF constant (default 60)
 * @param {Object} config - Hybrid search configuration
 * @returns {Array} Merged results sorted by RRF score
 */
export function applyReciprocalRankFusion(
  vectorResults,
  textResults,
  limit,
  k = RRF_K,
  config = DEFAULT_HYBRID_CONFIG
) {
  const scoresMap = new Map();

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
      const existing = scoresMap.get(key);
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
      ...entry.item,
      score: entry.finalScore,
      searchMethod: entry.searchMethod,
      originalVectorScore: entry.originalVectorScore,
      originalTextScore: entry.originalTextScore,
    }));
}

/**
 * Apply weighted combination to merge vector and text results
 * @param {Array} vectorResults - Results from vector search
 * @param {Array} textResults - Results from text search
 * @param {number} vectorWeight - Weight for vector results
 * @param {number} textWeight - Weight for text results
 * @param {number} limit - Maximum results to return
 * @returns {Array} Merged results sorted by combined score
 */
export function applyWeightedCombination(
  vectorResults,
  textResults,
  vectorWeight,
  textWeight,
  limit
) {
  const scoresMap = new Map();

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
      const existing = scoresMap.get(key);
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
      ...entry.item,
      score: entry.vectorScore + entry.textScore,
      searchMethod: entry.searchMethod,
      originalVectorScore: entry.originalVectorScore,
      originalTextScore: entry.originalTextScore,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Apply quality gate to filter out low-quality results after fusion
 * @param {Array} results - Fused search results
 * @param {boolean} hasTextMatches - Whether there were text matches
 * @param {Object} config - Hybrid search configuration
 * @returns {Array} Filtered results
 */
export function applyQualityGate(results, hasTextMatches, config = DEFAULT_HYBRID_CONFIG) {
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
 * @param {number} baseThreshold - Base similarity threshold
 * @param {boolean} hasTextMatches - Whether there were text matches
 * @param {Object} config - Hybrid search configuration
 * @returns {number} Adjusted threshold
 */
export function calculateDynamicThreshold(
  baseThreshold,
  hasTextMatches,
  config = DEFAULT_HYBRID_CONFIG
) {
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
 * @param {Array} textResults - Results from text search
 * @param {boolean} preferRRF - Whether to prefer RRF fusion
 * @returns {Object} Fusion strategy with useRRF, vectorWeight, textWeight
 */
export function determineFusionStrategy(textResults, preferRRF = true) {
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
 * @param {Array} results - Search results
 * @param {number} boostFactor - Quality boost factor
 * @returns {Array} Results with quality boost applied
 */
export function applyQualityBoost(results, boostFactor = 1.2) {
  return results.map((result) => {
    const qualityScore = result.qualityScore ?? result.payload?.quality_score ?? 1.0;
    const qualityBoost = 1 + (qualityScore - 0.5) * (boostFactor - 1);

    return {
      ...result,
      score: result.score * qualityBoost,
    };
  });
}

/**
 * Calculate text search score based on term frequency and position
 * @param {string} searchTerm - The search term
 * @param {string} text - The text to search in
 * @param {number} position - Position in results (for ranking penalty)
 * @returns {number} Calculated score between 0.1 and 1.0
 */
export function calculateTextSearchScore(searchTerm, text, position) {
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
