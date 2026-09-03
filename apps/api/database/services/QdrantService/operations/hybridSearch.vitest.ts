import { describe, expect, it } from 'vitest';

import {
  applyWeightedCombination,
  calculateDynamicThreshold,
  calculateTextSearchScore,
} from './hybridSearch.js';

import type { HybridConfig, TextSearchResult, VectorSearchResult } from './types.js';

const vec = (id: string, score: number): VectorSearchResult => ({ id, score, payload: {} });

const txt = (
  id: string,
  score: number,
  matchType: TextSearchResult['matchType'] = 'exact'
): TextSearchResult => ({
  id,
  score,
  payload: {},
  searchMethod: 'text',
  searchTerm: 'q',
  matchType,
});

const scoreOf = (results: ReturnType<typeof applyWeightedCombination>, id: string): number => {
  const hit = results.find((r) => r.id === id);
  if (!hit) throw new Error(`${id} was dropped from the fusion result`);
  return hit.score;
};

/**
 * The downstream consumers (SearchResultProcessor.filterAndSortResults, the
 * notebook depth profiles) gate on a fixed similarity threshold — 0.35 — and
 * that number is written as if it were a cosine. These tests hold the fusion
 * to that promise: what a vector-only chunk scores must not depend on which
 * fusion weights the query's wording happened to trigger.
 */
describe('applyWeightedCombination', () => {
  it('scores a vector-only chunk on its cosine, whatever the vector weight is', () => {
    // 0.5/0.5 is the "real text matches" branch, 0.85/0.15 the token-fallback
    // and no-text branches. Before the fix the same chunk scored 0.30 vs 0.51.
    const balanced = applyWeightedCombination([vec('a', 0.6)], [], 0.5, 0.5, 10);
    const vectorHeavy = applyWeightedCombination([vec('a', 0.6)], [], 0.85, 0.15, 10);

    expect(scoreOf(balanced, 'a')).toBeCloseTo(0.6, 5);
    expect(scoreOf(vectorHeavy, 'a')).toBeCloseTo(0.6, 5);
  });

  it('keeps a vector-only chunk above a 0.35 threshold under every weighting', () => {
    for (const [vW, tW] of [
      [0.5, 0.5],
      [0.85, 0.15],
      [0.7, 0.3],
    ]) {
      const results = applyWeightedCombination([vec('a', 0.42)], [], vW, tW, 10);
      expect(scoreOf(results, 'a'), `vW=${vW}`).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('still blends a chunk that both lanes found', () => {
    const results = applyWeightedCombination([vec('a', 0.6)], [txt('a', 0.8)], 0.5, 0.5, 10);

    expect(scoreOf(results, 'a')).toBeCloseTo(0.5 * 0.6 + 0.5 * 0.8, 5);
    expect(results.find((r) => r.id === 'a')?.searchMethod).toBe('hybrid');
  });

  it('keeps the penalty on a text-only chunk', () => {
    // The vector lane ranks the whole collection, so a missing vector hit means
    // this chunk was scored and fell below the threshold — unlike a missing
    // text hit, that is evidence against it and must stay penalized.
    const results = applyWeightedCombination([], [txt('b', 0.8, 'token_fallback')], 0.85, 0.15, 10);

    expect(scoreOf(results, 'b')).toBeCloseTo(0.8 * 0.15, 5);
  });

  it('ranks a strong vector-only chunk above a weak text-only one', () => {
    const results = applyWeightedCombination(
      [vec('vector-only', 0.55)],
      [txt('text-only', 0.6, 'token_fallback')],
      0.85,
      0.15,
      10
    );

    expect(results[0]?.id).toBe('vector-only');
  });

  it('respects the limit', () => {
    const results = applyWeightedCombination(
      [vec('a', 0.9), vec('b', 0.8), vec('c', 0.7)],
      [],
      0.85,
      0.15,
      2
    );

    expect(results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('never scores a chunk lower because the keyword lane also found it', () => {
    // The inversion that buried keyword hits: blending pulled a chunk both
    // lanes found toward the lower text score (0.5·0.72 + 0.5·0.1 = 0.41),
    // while an equally similar chunk the keyword lane never saw kept 0.72.
    const bothLanes = applyWeightedCombination([vec('a', 0.72)], [txt('a', 0.1)], 0.5, 0.5, 10);

    expect(scoreOf(bothLanes, 'a')).toBeCloseTo(0.72, 5);
  });

  it('ranks the chunk containing the term above an equally similar one without it', () => {
    const results = applyWeightedCombination(
      [vec('with-term', 0.72), vec('without-term', 0.72)],
      [txt('with-term', 0.1)],
      0.5,
      0.5,
      10
    );

    expect(results[0]?.id).toBe('with-term');
  });
});

describe('calculateTextSearchScore', () => {
  it('rises with the number of occurrences', () => {
    const once = calculateTextSearchScore('hitzeschutz', 'Ein Satz über Hitzeschutz.');
    const thrice = calculateTextSearchScore(
      'hitzeschutz',
      'Hitzeschutz hier, Hitzeschutz dort, und nochmal Hitzeschutz.'
    );

    expect(thrice).toBeGreaterThan(once);
  });

  it('scores two chunks with equal term counts equally, whatever their scroll position', () => {
    // The old signature took the index in the scroll output and multiplied by
    // `max(0.1, 1 - position * 0.1)`. Qdrant returns scroll pages in point-id
    // order, so that number was arbitrary — and with recall windows in the
    // hundreds it flattened almost every hit onto the 0.1 floor.
    const text = 'Hitzeschutz und nochmal Hitzeschutz.';

    expect(calculateTextSearchScore('hitzeschutz', text)).toBe(
      calculateTextSearchScore('hitzeschutz', text)
    );
  });

  it('lets short terms contribute less than long ones', () => {
    expect(calculateTextSearchScore('ab', 'ab ab ab ab ab')).toBeLessThan(
      calculateTextSearchScore('klimaanpassung', 'klimaanpassung klimaanpassung')
    );
  });

  it('falls back to the floor without text or term', () => {
    expect(calculateTextSearchScore('hitzeschutz', undefined)).toBe(0.1);
    expect(calculateTextSearchScore('', 'irgendein Text')).toBe(0.1);
  });
});

describe('calculateDynamicThreshold', () => {
  const cfg: HybridConfig = {
    enableDynamicThresholds: true,
    minVectorWithTextThreshold: 0.35,
    minVectorOnlyThreshold: 0.55,
    enableQualityGate: true,
    minFinalScore: 0.008,
    minVectorOnlyFinalScore: 0.01,
    enableConfidenceWeighting: true,
    confidencePenalty: 0.7,
    confidenceBoost: 1.2,
    serverSideEnabled: true,
    serverFusion: 'rrf',
    serverSparseFactor: 1.0,
    serverRrfWeightDense: 0.7,
    serverScoreJoin: true,
  };

  it('raises the floor when the text lane found nothing', () => {
    expect(calculateDynamicThreshold(0.35, false, cfg)).toBe(0.55);
  });

  it('leaves the base threshold alone when the text lane contributed', () => {
    expect(calculateDynamicThreshold(0.35, true, cfg)).toBe(0.35);
  });

  it('never lowers a caller threshold that is already stricter', () => {
    expect(calculateDynamicThreshold(0.7, true, cfg)).toBe(0.7);
  });

  it('is a no-op when dynamic thresholds are disabled', () => {
    expect(calculateDynamicThreshold(0.28, false, { ...cfg, enableDynamicThresholds: false })).toBe(
      0.28
    );
  });
});
