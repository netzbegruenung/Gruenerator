/**
 * DocumentSearchService Scoring Module
 *
 * Handles score calculation for document search results, including:
 * - Base score computation from chunk similarities
 * - Quality-weighted score enhancement
 * - Hybrid search score adjustments
 * - Relevance information formatting
 */

import type {
  ChunkData,
  DocumentChunkData,
  BaseScore,
  DocumentEnhancedScore,
  HybridMetadata,
  RawChunk,
  DocumentRawChunk,
} from './types.js';

// Import vectorConfig for scoring configuration
// Note: This is a JavaScript module, so we use .js extension
import { vectorConfig } from '../../../config/vectorConfig.js';

/**
 * Compute a stable base score using configured weights
 *
 * Calculates fundamental scoring components without quality adjustments:
 * - Maximum similarity across chunks
 * - Average similarity
 * - Diversity bonus based on chunk count
 *
 * @param chunks - Array of chunk data with similarity scores
 * @returns Base score components
 */
export function computeSafeBaseScore(chunks: ChunkData[]): BaseScore {
  const scoringConfig = vectorConfig.get('scoring');

  if (!chunks || chunks.length === 0) {
    return {
      finalScore: 0,
      maxSimilarity: 0,
      avgSimilarity: 0,
      positionScore: 0,
      diversityBonus: 0,
    };
  }

  const sims = chunks.map((c) => c.similarity || 0);
  const maxSimilarity = Math.max(...sims);
  const avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;

  const diversityBonus = Math.min(
    scoringConfig.maxDiversityBonus,
    chunks.length * scoringConfig.diversityBonusRate
  );

  const finalScoreRaw =
    maxSimilarity * scoringConfig.maxSimilarityWeight +
    avgSimilarity * scoringConfig.avgSimilarityWeight +
    diversityBonus;

  const finalScore = Math.min(scoringConfig.maxFinalScore, finalScoreRaw);

  return {
    finalScore,
    maxSimilarity,
    avgSimilarity,
    positionScore: 0,
    diversityBonus,
  };
}

/**
 * Calculate enhanced document score with quality weighting
 *
 * Applies quality score adjustments to the base similarity score:
 * - Computes average quality from chunk metadata
 * - Applies quality boost factor from configuration
 * - Ensures final score stays within valid range [0, 1]
 *
 * @param chunks - Array of document chunks with quality metadata
 * @returns Enhanced score with quality information
 */
export function calculateEnhancedDocumentScore(chunks: DocumentChunkData[]): DocumentEnhancedScore {
  const base = computeSafeBaseScore(chunks);

  const qualities = chunks.map((c) =>
    typeof c.quality_score === 'number' ? c.quality_score : 1.0
  );
  const avgQ = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 1.0;

  const qCfg =
    (vectorConfig.get('quality') as { retrieval?: { qualityBoostFactor?: number } })?.retrieval ||
    {};
  const boost = qCfg.qualityBoostFactor ?? 1.2;

  const factor = 1 + (avgQ - 0.5) * (boost - 1);

  return {
    ...base,
    finalScore: Math.min(1.0, base.finalScore * factor),
    qualityAvg: avgQ,
  };
}

/**
 * Calculate hybrid document score with multiple signals
 *
 * Combines vector and text search results with quality adjustments:
 * - Starts from base similarity score
 * - Adds hybrid bonus if both vector and text matches present
 * - Applies quality weighting
 * - Ensures score normalization
 *
 * @param chunks - Array of document chunks
 * @param hybridMetadata - Metadata about hybrid search signals
 * @returns Enhanced score with hybrid and quality components
 */
export function calculateHybridDocumentScore(
  chunks: DocumentChunkData[],
  hybridMetadata?: HybridMetadata
): DocumentEnhancedScore {
  const baseSimple = computeSafeBaseScore(chunks);

  const bothSignals = hybridMetadata?.hasVectorMatch && hybridMetadata?.hasTextMatch;
  const hybridBonus = bothSignals ? 0.05 : 0;

  const qualities = chunks.map((c) =>
    typeof c.quality_score === 'number' ? c.quality_score : 1.0
  );
  const avgQ = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 1.0;

  const qCfg =
    (vectorConfig.get('quality') as { retrieval?: { qualityBoostFactor?: number } })?.retrieval ||
    {};
  const boost = qCfg.qualityBoostFactor ?? 1.2;
  const factor = 1 + (avgQ - 0.5) * (boost - 1);

  return {
    ...baseSimple,
    finalScore: Math.min(1.0, (baseSimple.finalScore + hybridBonus) * factor),
    diversityBonus: baseSimple.diversityBonus,
    hybridBonus,
    qualityAvg: avgQ,
  };
}

/**
 * Extract chunk data with quality metadata
 *
 * Transforms raw chunk from database into structured chunk data
 * with quality information included.
 *
 * @param chunk - Raw chunk from search result
 * @returns Structured chunk data
 */
export function extractChunkData(chunk: DocumentRawChunk): DocumentChunkData {
  return {
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    text: chunk.chunk_text,
    content_type: chunk.content_type ?? null,
    page_number: chunk.page_number ?? null,
    similarity: chunk.similarity,
    token_count: chunk.token_count,
    quality_score: chunk.quality_score ?? undefined,
    searchMethod: chunk.searchMethod,
    originalVectorScore: chunk.originalVectorScore ?? null,
    originalTextScore: chunk.originalTextScore ?? null,
  };
}

/**
 * Build relevance information string with quality metrics
 *
 * Creates human-readable relevance description including:
 * - Similarity score
 * - Quality average (if available)
 *
 * @param doc - Document result data
 * @param enhancedScore - Enhanced score with quality information
 * @returns Formatted relevance string
 */
export function buildRelevanceInfo(
  doc: { similarity_score: number },
  enhancedScore: DocumentEnhancedScore
): string {
  let base = `Relevance: ${(doc.similarity_score * 100).toFixed(1)}%`;

  if (typeof enhancedScore.qualityAvg === 'number') {
    base += ` (quality avg: ${enhancedScore.qualityAvg.toFixed(2)})`;
  }

  return base;
}
