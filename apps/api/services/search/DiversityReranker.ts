/**
 * Diversity Reranker (Maximal Marginal Relevance)
 *
 * Applies MMR as a second-pass reranking step to ensure result diversity.
 * After LLM scoring, this penalizes results that are too similar to
 * already-selected results, promoting coverage of multiple subtopics.
 *
 * Algorithm: score = λ * relevance - (1-λ) * max_similarity_to_already_selected
 * Similarity: Jaccard overlap on word bigrams (fast, no embeddings needed)
 *
 * λ = 0.7 by default (favors relevance, but penalizes redundancy)
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('DiversityReranker');

export interface ScoredResult {
  relevance?: number;
  content: string;
  title?: string;
  [key: string]: any;
}

/**
 * Extract word bigrams from text for similarity computation.
 */
function extractBigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\wäöüß]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]}_${words[i + 1]}`);
  }
  return bigrams;
}

/**
 * Compute Jaccard similarity between two bigram sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Apply Maximal Marginal Relevance (MMR) reranking.
 *
 * Keeps the top `keepTop` results unchanged (highest relevance positions),
 * then applies MMR for the remaining positions to maximize diversity.
 *
 * @param results - Results sorted by relevance (highest first)
 * @param lambda - Balance between relevance and diversity (0-1, higher = more relevance)
 * @param keepTop - Number of top results to keep unchanged
 * @returns Reordered results with diversity applied
 */
export function applyMMR<T extends ScoredResult>(
  results: T[],
  lambda: number = 0.7,
  keepTop: number = 2
): T[] {
  if (results.length <= keepTop) return results;

  // Pre-compute bigrams for all results
  const bigrams = results.map((r) => extractBigrams(`${r.title || ''} ${r.content}`));

  // Keep top results unchanged
  const selected: T[] = results.slice(0, keepTop);
  const selectedBigrams: Set<string>[] = bigrams.slice(0, keepTop);
  const remaining = results.slice(keepTop).map((r, i) => ({ result: r, index: i + keepTop }));

  // Greedily select remaining results using MMR
  while (remaining.length > 0) {
    let bestScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.result.relevance || 0;
      const candidateBigrams = bigrams[candidate.index];

      // Find maximum similarity to any already-selected result
      let maxSim = 0;
      for (const selBigrams of selectedBigrams) {
        const sim = jaccardSimilarity(candidateBigrams, selBigrams);
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    selected.push(chosen.result);
    selectedBigrams.push(bigrams[chosen.index]);
  }

  log.info(`[MMR] Applied diversity reranking to ${results.length} results (λ=${lambda}, keepTop=${keepTop})`);
  return selected;
}
