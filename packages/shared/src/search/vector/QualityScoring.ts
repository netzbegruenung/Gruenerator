/**
 * QualityScoring - Quality-aware search filtering and boosting
 * Filters low-quality chunks and boosts high-quality results
 */

import type { VectorSearchResult, QualityConfig } from './types.js';
import { DEFAULT_QUALITY_CONFIG } from './constants.js';

/**
 * Filter results by quality score
 */
export function filterByQuality(
  results: VectorSearchResult[],
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): VectorSearchResult[] {
  if (!config.enabled || !config.retrieval.enableQualityFilter) {
    return results;
  }

  const minQuality = config.retrieval.minRetrievalQuality;

  return results.filter((r) => {
    const qualityScore = r.qualityScore ?? (r.payload?.quality_score as number | undefined);
    // Keep chunks without quality score (legacy data)
    return typeof qualityScore === 'number' ? qualityScore >= minQuality : true;
  });
}

/**
 * Apply quality-based boost to result scores
 */
export function applyQualityBoost(
  results: VectorSearchResult[],
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): VectorSearchResult[] {
  if (!config.enabled) {
    return results;
  }

  const boostFactor = config.retrieval.qualityBoostFactor;

  return results.map((r) => {
    const qualityScore = r.qualityScore ?? (r.payload?.quality_score as number | undefined) ?? 1.0;
    // Boost formula: score * (1 + (quality - 0.5) * (boostFactor - 1))
    const boost = 1 + (qualityScore - 0.5) * (boostFactor - 1);

    return {
      ...r,
      score: r.score * boost,
      qualityScore,
    };
  });
}

/**
 * Combined quality-aware search: filter then boost
 */
export function searchWithQuality(
  results: VectorSearchResult[],
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): VectorSearchResult[] {
  if (!config.enabled) {
    return results;
  }

  // Step 1: Filter low-quality results
  const filtered = filterByQuality(results, config);

  // Step 2: Apply quality-based score boosting
  const boosted = applyQualityBoost(filtered, config);

  // Step 3: Re-sort by boosted scores
  return boosted.sort((a, b) => b.score - a.score);
}

/**
 * Calculate chunk quality score based on content analysis
 * Used during indexing, but included here for completeness
 */
export function calculateChunkQuality(
  text: string,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): number {
  if (!text || text.length === 0) {
    return 0;
  }

  const weights = config.weights;

  // Readability: sentence length, word variety
  const readability = calculateReadability(text);

  // Completeness: proper sentences, not fragments
  const completeness = calculateCompleteness(text);

  // Structure: headings, lists, paragraphs
  const structure = calculateStructure(text);

  // Density: information density vs boilerplate
  const density = calculateDensity(text);

  // Weighted sum
  const score =
    readability * weights.readability +
    completeness * weights.completeness +
    structure * weights.structure +
    density * weights.density;

  return Math.min(1, Math.max(0, score));
}

/**
 * Calculate readability score (0-1)
 */
function calculateReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;

  // Average sentence length (ideal: 15-25 words)
  const totalWords = text.split(/\s+/).length;
  const avgSentenceLength = totalWords / sentences.length;

  let readabilityScore = 1;
  if (avgSentenceLength < 5) readabilityScore *= 0.5;
  else if (avgSentenceLength > 40) readabilityScore *= 0.6;
  else if (avgSentenceLength >= 15 && avgSentenceLength <= 25) readabilityScore *= 1.0;

  // Word variety (unique words / total words)
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const variety = uniqueWords.size / Math.max(words.length, 1);
  readabilityScore *= 0.5 + variety * 0.5;

  return Math.min(1, readabilityScore);
}

/**
 * Calculate completeness score (0-1)
 */
function calculateCompleteness(text: string): number {
  // Check for proper sentence endings
  const hasProperEnding = /[.!?]\s*$/.test(text.trim());

  // Check for proper sentence starts (capital letter after period)
  const properStarts = text.match(/[.!?]\s+[A-ZÄÖÜ]/g)?.length || 0;
  const totalSentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;

  let score = 0.5;
  if (hasProperEnding) score += 0.25;
  if (totalSentences > 0 && properStarts / totalSentences > 0.5) score += 0.25;

  return score;
}

/**
 * Calculate structure score (0-1)
 */
function calculateStructure(text: string): number {
  let score = 0.5;

  // Check for markdown headings
  if (/^#+\s/m.test(text)) score += 0.2;

  // Check for lists
  if (/^[-*•]\s/m.test(text) || /^\d+[.)]\s/m.test(text)) score += 0.15;

  // Check for paragraphs (multiple newlines)
  if (/\n\s*\n/.test(text)) score += 0.15;

  return Math.min(1, score);
}

/**
 * Calculate information density (0-1)
 */
function calculateDensity(text: string): number {
  const words = text.split(/\s+/);
  const totalWords = words.length;

  if (totalWords < 10) return 0.3; // Too short

  // Count stop words (German)
  const stopWords = new Set([
    'der', 'die', 'das', 'und', 'in', 'zu', 'den', 'ist', 'von', 'mit',
    'für', 'auf', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat',
    'dass', 'sie', 'nach', 'bei', 'eine', 'um', 'am', 'sind', 'noch', 'wie',
    'einem', 'einen', 'einer', 'über', 'so', 'zum', 'kann', 'wurde', 'haben',
    'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein',
  ]);

  const stopWordCount = words.filter((w) => stopWords.has(w.toLowerCase())).length;
  const stopWordRatio = stopWordCount / totalWords;

  // High stop word ratio = low density
  // Ideal ratio is around 0.3-0.5
  let density = 1;
  if (stopWordRatio > 0.6) density *= 0.6;
  else if (stopWordRatio > 0.5) density *= 0.8;
  else if (stopWordRatio < 0.2) density *= 0.7; // Too few might indicate technical jargon

  return density;
}

/**
 * Get quality statistics for a set of results
 */
export function getQualityStats(results: VectorSearchResult[]): {
  min: number;
  max: number;
  avg: number;
  count: number;
  withQuality: number;
} {
  const qualityScores = results
    .map((r) => r.qualityScore ?? (r.payload?.quality_score as number | undefined))
    .filter((q): q is number => typeof q === 'number');

  if (qualityScores.length === 0) {
    return { min: 0, max: 0, avg: 0, count: results.length, withQuality: 0 };
  }

  return {
    min: Math.min(...qualityScores),
    max: Math.max(...qualityScores),
    avg: qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
    count: results.length,
    withQuality: qualityScores.length,
  };
}
