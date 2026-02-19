/**
 * Scoring Algorithms for Search Services
 *
 * Functions for calculating document scores, dynamic thresholds,
 * and diversity-aware ranking with MMR support.
 */

import { vectorConfig } from '../../config/vectorConfig.js';

import type { ChunkData, EnhancedScore, HybridMetadata, DocumentResult } from './types.js';

interface VectorScoringConfig {
  maxSimilarityWeight?: number;
  avgSimilarityWeight?: number;
  positionWeight?: number;
  minPositionWeight?: number;
  positionDecayRate?: number;
  maxDiversityBonus: number;
  diversityBonusRate: number;
  maxFinalScore?: number;
  [key: string]: unknown;
}

/**
 * Calculate enhanced document score with position weighting and diversity bonus
 * Uses centralized vectorConfig for all parameters
 *
 * @param chunks - Array of document chunks with similarity scores
 * @returns Enhanced scoring metrics
 */
export function calculateEnhancedDocumentScore(chunks: ChunkData[]): EnhancedScore {
  const scoringConfig = vectorConfig.get('scoring') as VectorScoringConfig;

  if (!chunks || chunks.length === 0) {
    return {
      finalScore: 0,
      maxSimilarity: 0,
      avgSimilarity: 0,
      positionScore: 0,
      diversityBonus: 0,
    };
  }

  // Extract similarities (prefer adjusted if available)
  const similarities = chunks.map((c) => c.similarity_adjusted ?? c.similarity ?? 0);
  const maxSimilarity = Math.max(...similarities);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Position-aware scoring
  const minPositionWeight =
    typeof scoringConfig.minPositionWeight === 'number' ? scoringConfig.minPositionWeight : 0.1;
  const positionDecayRate =
    typeof scoringConfig.positionDecayRate === 'number' ? scoringConfig.positionDecayRate : 0.05;

  let positionScore = 0;
  for (const chunk of chunks) {
    const positionWeight = Math.max(minPositionWeight, 1 - chunk.chunk_index * positionDecayRate);
    positionScore += (chunk.similarity_adjusted ?? chunk.similarity ?? 0) * positionWeight;
  }
  positionScore = positionScore / chunks.length;

  // Diversity bonus based on number of matching chunks
  const diversityBonus = Math.min(
    scoringConfig.maxDiversityBonus,
    chunks.length * scoringConfig.diversityBonusRate
  );

  // Weighted final score
  const maxW =
    typeof scoringConfig.maxSimilarityWeight === 'number' ? scoringConfig.maxSimilarityWeight : 0.6;
  const avgW =
    typeof scoringConfig.avgSimilarityWeight === 'number' ? scoringConfig.avgSimilarityWeight : 0.4;
  const posW =
    typeof scoringConfig.positionWeight === 'number' ? scoringConfig.positionWeight : 0.0;

  const finalScore =
    maxSimilarity * maxW + avgSimilarity * avgW + positionScore * posW + diversityBonus;
  const maxFinalScore =
    typeof scoringConfig.maxFinalScore === 'number' ? scoringConfig.maxFinalScore : 1.0;

  // Compute average quality if present
  const qualityScores = chunks
    .filter((c) => typeof c.quality_score === 'number')
    .map((c) => c.quality_score as number);
  const qualityAvg =
    qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : undefined;

  return {
    finalScore: Math.min(maxFinalScore, finalScore),
    maxSimilarity,
    avgSimilarity,
    positionScore,
    diversityBonus,
    qualityAvg,
  };
}

/**
 * Calculate enhanced document score with hybrid search factors
 * Adds bonus when document is found by both vector and text search
 *
 * @param chunks - Array of document chunks with hybrid metadata
 * @param hybridMetadata - Document-level hybrid metadata
 * @returns Enhanced scoring metrics with hybrid bonuses
 */
export function calculateHybridDocumentScore(
  chunks: ChunkData[],
  hybridMetadata: HybridMetadata
): EnhancedScore {
  const baseScore = calculateEnhancedDocumentScore(chunks);

  // Add hybrid search bonus when found by both methods
  let hybridBonus = 0;
  if (hybridMetadata.hasVectorMatch && hybridMetadata.hasTextMatch) {
    hybridBonus = 0.05;
  }

  return {
    ...baseScore,
    finalScore: Math.min(1.0, baseScore.finalScore + hybridBonus),
    hybridBonus,
  };
}

/**
 * Calculate dynamic similarity threshold based on query characteristics
 * Uses vectorConfig for all threshold parameters
 *
 * @param query - Search query
 * @param baseThreshold - Base threshold (defaults to config value)
 * @param serviceName - Service name for logging
 * @returns Calculated threshold between min and max
 */
export function calculateDynamicThreshold(
  query: string,
  baseThreshold?: number,
  serviceName = 'BaseSearch'
): number {
  const searchConfig = vectorConfig.get('search');
  const actualBaseThreshold = baseThreshold ?? searchConfig.defaultThreshold;
  const queryWords = query.trim().split(/\s+/);
  const queryLength = queryWords.length;

  // Query length adjustment using configuration
  const adjustments = searchConfig.lengthAdjustments;
  let lengthAdjustment = 0;

  if (queryLength === 1) {
    lengthAdjustment = adjustments.singleWord;
  } else if (queryLength === 2) {
    lengthAdjustment = adjustments.twoWords;
  } else if (queryLength >= adjustments.manyWordsThreshold) {
    lengthAdjustment = adjustments.manyWords;
  }

  const finalThreshold = actualBaseThreshold + lengthAdjustment;
  const clampedThreshold = Math.max(
    searchConfig.minThreshold,
    Math.min(searchConfig.maxThreshold, finalThreshold)
  );

  if (vectorConfig.isVerboseMode()) {
    console.log(
      `[${serviceName}] Dynamic threshold: base=${actualBaseThreshold}, length_adj=${lengthAdjustment}, final=${clampedThreshold}`
    );
  }

  return clampedThreshold;
}

/**
 * Static version of document score calculation
 * Used by static utility methods that don't have access to config
 *
 * @param chunks - Array of document chunks with similarity scores
 * @returns Enhanced scoring metrics
 */
export function calculateStaticDocumentScore(chunks: ChunkData[]): EnhancedScore {
  if (!chunks || chunks.length === 0) {
    return {
      finalScore: 0,
      maxSimilarity: 0,
      avgSimilarity: 0,
      positionScore: 0,
      diversityBonus: 0,
    };
  }

  const similarities = chunks.map((c) => c.similarity_adjusted ?? c.similarity ?? 0);
  const maxSimilarity = Math.max(...similarities);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Position-aware scoring with default values
  let positionScore = 0;
  for (const chunk of chunks) {
    const positionWeight = Math.max(0.1, 1 - chunk.chunk_index * 0.05);
    positionScore += (chunk.similarity_adjusted ?? chunk.similarity ?? 0) * positionWeight;
  }
  positionScore = positionScore / chunks.length;

  // Diversity bonus
  const diversityBonus = Math.min(0.1, chunks.length * 0.02);

  // Weighted final score
  const finalScore =
    maxSimilarity * 0.6 + avgSimilarity * 0.3 + positionScore * 0.1 + diversityBonus;

  return {
    finalScore: Math.min(1.0, finalScore),
    maxSimilarity,
    avgSimilarity,
    positionScore,
    diversityBonus,
  };
}

/**
 * Static version of threshold calculation
 * Used by static utility methods
 *
 * @param query - Search query
 * @param baseThreshold - Base threshold (default: 0.3)
 * @returns Calculated threshold
 */
export function calculateStaticThreshold(query: string, baseThreshold = 0.3): number {
  const queryWords = query.trim().split(/\s+/);
  const queryLength = queryWords.length;

  let adjustment = 0;
  if (queryLength === 1) {
    adjustment = 0.0;
  } else if (queryLength === 2) {
    adjustment = 0.05;
  } else if (queryLength >= 5) {
    adjustment = -0.1;
  }

  return Math.max(0.2, Math.min(0.8, baseThreshold + adjustment));
}

/**
 * Apply Maximal Marginal Relevance (MMR) selection for diversity
 * Balances relevance with diversity among selected results
 *
 * @param results - Scored document results
 * @param limit - Maximum results to return
 * @param lambda - Balance between relevance and diversity (0-1)
 * @returns Diversified selection of results
 */
export function applyMMRSelection(
  results: DocumentResult[],
  limit: number,
  lambda = 0.7
): DocumentResult[] {
  if (results.length <= limit) {
    return results;
  }

  const selected: DocumentResult[] = [];
  const used = new Set<number>();

  // Token cache for similarity computation
  const tokenCache = new Map<string, Set<string>>();

  const getTokens = (text: string | undefined): Set<string> => {
    if (!text) return new Set();
    if (tokenCache.has(text)) return tokenCache.get(text)!;

    const tokens = text
      .toLowerCase()
      .replace(/[^a-zäöüß0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4);

    const set = new Set(tokens);
    tokenCache.set(text, set);
    return set;
  };

  const jaccard = (aSet: Set<string>, bSet: Set<string>): number => {
    if (!aSet.size || !bSet.size) return 0;

    let inter = 0;
    for (const t of aSet) {
      if (bSet.has(t)) inter++;
    }

    const union = aSet.size + bSet.size - inter;
    return union > 0 ? inter / union : 0;
  };

  // Greedy MMR selection
  while (selected.length < Math.min(limit, results.length)) {
    let bestIdx: number | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < results.length; i++) {
      if (used.has(i)) continue;

      const candidate = results[i];
      const relevance = candidate.similarity_score || 0;

      // Calculate max similarity to already selected items
      let maxSim = 0;
      if (selected.length > 0) {
        const candTokens = getTokens(candidate.relevant_content);

        for (const sel of selected) {
          const selTokens = getTokens(sel.relevant_content);
          const sim = jaccard(candTokens, selTokens);
          if (sim > maxSim) maxSim = sim;
        }
      }

      // MMR score: balance relevance with diversity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === null) break;

    used.add(bestIdx);
    selected.push(results[bestIdx]);
  }

  return selected;
}
