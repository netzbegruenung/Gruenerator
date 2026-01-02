/**
 * String Distance and Similarity Utilities
 *
 * Provides algorithms for measuring string similarity, useful for
 * fuzzy name matching and deduplication.
 */

import { foldUmlauts } from './textNormalization';

/**
 * Calculate the Levenshtein (edit) distance between two strings.
 * This measures the minimum number of single-character edits
 * (insertions, deletions, substitutions) required to transform s1 into s2.
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @returns The edit distance (0 = identical, higher = more different)
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  // Create DP matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Base cases: transforming empty string to s1[0..i] or s2[0..j]
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Normalize a string for name matching comparison.
 * More aggressive than normalizeQuery - removes all non-letter characters.
 *
 * @param name - Name to normalize
 * @returns Normalized string suitable for comparison
 */
export function normalizeForNameMatch(name: string): string {
  if (!name) return '';
  return foldUmlauts(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Keep only letters and spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two names using multiple strategies.
 * Returns a score between 0 (completely different) and 1 (identical).
 *
 * Strategies:
 * 1. Exact match after normalization -> 1.0
 * 2. Substring containment -> scaled by length ratio (max 0.95)
 * 3. Levenshtein distance -> scaled by max length
 *
 * @param name1 - First name
 * @param name2 - Second name
 * @returns Similarity score (0 to 1)
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeForNameMatch(name1);
  const n2 = normalizeForNameMatch(name2);

  // Exact match
  if (n1 === n2) return 1.0;

  // Empty check
  if (!n1 || !n2) return 0;

  // Substring containment (partial match)
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length >= n2.length ? n1 : n2;
    return (shorter.length / longer.length) * 0.95;
  }

  // Levenshtein distance
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

/**
 * Find the best match from a list of candidates.
 * Returns the candidate with the highest similarity score above the threshold.
 *
 * @param target - Name to match
 * @param candidates - Array of candidate names
 * @param threshold - Minimum similarity score (default 0.7)
 * @returns Best match with score, or null if no match above threshold
 */
export function findBestMatch(
  target: string,
  candidates: string[],
  threshold = 0.7
): { match: string; score: number } | null {
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = calculateNameSimilarity(target, candidate);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}
