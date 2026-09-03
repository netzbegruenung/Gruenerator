/**
 * Pure functions and shapes of the answer-eval. No live calls — a seeded
 * `rng` stands in for `Math.random` everywhere randomness is involved.
 */
import { describe, it, expect } from 'vitest';

import {
  ALL_COMPARISONS,
  ANSWER_VARIANTS,
  COMPARISONS,
  buildAbMapping,
  judgeResultSchema,
  mean,
  resolveComparisons,
  resolveWinner,
  shuffleVariants,
  sideOf,
  tally,
  VARIANT_RERANK,
  type AnswerVariant,
} from './answerEvalCore.js';

/** Deterministic sequence stand-in for `Math.random`. */
function seededRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('shuffleVariants', () => {
  it('returns a permutation of the input, never a subset or a duplicate', () => {
    for (const seed of [0, 0.1, 0.4, 0.5, 0.9, 0.99]) {
      const out = shuffleVariants(seededRng([seed]));
      expect(out).toHaveLength(ANSWER_VARIANTS.length);
      expect(new Set(out)).toEqual(new Set(ANSWER_VARIANTS));
    }
  });

  it('does not mutate the input array', () => {
    const input: AnswerVariant[] = ['none', 'today', 'filter'];
    shuffleVariants(seededRng([0.7]), input);
    expect(input).toEqual(['none', 'today', 'filter']);
  });
});

describe('buildAbMapping / sideOf / resolveWinner', () => {
  it('round-trips: sideOf undoes buildAbMapping in both directions', () => {
    for (const coin of [0, 0.2, 0.49, 0.5, 0.8, 0.999]) {
      const mapping = buildAbMapping('filter', 'today', coin);
      expect(new Set([mapping.A, mapping.B])).toEqual(new Set(['filter', 'today']));
      expect(sideOf(mapping, 'filter')).toBe(mapping.A === 'filter' ? 'A' : 'B');
      expect(sideOf(mapping, 'today')).toBe(mapping.A === 'today' ? 'A' : 'B');
      expect(sideOf(mapping, 'none')).toBeNull();
    }
  });

  it('resolveWinner undoes the mapping: resolving the side that IS the challenger returns it', () => {
    const mapping = buildAbMapping('filter', 'none', 0.9); // A: none, B: filter
    expect(mapping).toEqual({ A: 'none', B: 'filter' });
    expect(resolveWinner(mapping, 'A')).toBe('none');
    expect(resolveWinner(mapping, 'B')).toBe('filter');
    expect(resolveWinner(mapping, 'tie')).toBe('tie');
  });
});

describe('tally', () => {
  it('splits wins/ties/losses and keeps ties in every rate denominator', () => {
    const winners: Array<AnswerVariant | 'tie'> = [
      'filter',
      'filter',
      'today',
      'tie',
      'tie',
      'today',
    ];
    const t = tally(winners, 'filter');
    expect(t).toEqual({
      n: 6,
      wins: 2,
      ties: 2,
      losses: 2,
      winRate: 2 / 6,
      tieRate: 2 / 6,
      lossRate: 2 / 6,
    });
    expect(t.winRate + t.tieRate + t.lossRate).toBeCloseTo(1);
  });

  it('returns all-zero for an empty run, not NaN', () => {
    expect(tally([], 'filter')).toEqual({
      n: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      winRate: 0,
      tieRate: 0,
      lossRate: 0,
    });
  });
});

describe('mean', () => {
  it('averages, and returns 0 (not NaN) for an empty list', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
});

describe('judgeResultSchema', () => {
  it('parses a well-formed judge answer', () => {
    const sample = {
      winner: 'A',
      answersQuestion: { A: 3, B: 1 },
      groundedInSources: { A: 2, B: 1 },
      inventedSource: { A: false, B: true },
      missingImportant: { A: false, B: false },
      rationale: 'Antwort A beantwortet die Frage direkt und belegt sie mit den Quellen.',
    };
    const parsed = judgeResultSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.winner).toBe('A');
  });

  it('rejects an out-of-range score', () => {
    const sample = {
      winner: 'tie',
      answersQuestion: { A: 4, B: 1 },
      groundedInSources: { A: 2, B: 1 },
      inventedSource: { A: false, B: false },
      missingImportant: { A: false, B: false },
      rationale: 'x',
    };
    expect(judgeResultSchema.safeParse(sample).success).toBe(false);
  });

  it('rejects a missing rationale', () => {
    const { rationale: _rationale, ...withoutRationale } = {
      winner: 'B',
      answersQuestion: { A: 1, B: 2 },
      groundedInSources: { A: 1, B: 2 },
      inventedSource: { A: false, B: false },
      missingImportant: { A: false, B: false },
      rationale: 'x',
    };
    expect(judgeResultSchema.safeParse(withoutRationale).success).toBe(false);
  });
});

describe('VARIANT_RERANK', () => {
  it('covers exactly the four variants with the shapes handleNotebookStream expects', () => {
    expect(Object.keys(VARIANT_RERANK).sort()).toEqual([...ANSWER_VARIANTS].sort());
    expect(VARIANT_RERANK.none).toEqual({ mode: 'off' });
    expect(VARIANT_RERANK.today).toEqual({ mode: 'sort' });
    expect(VARIANT_RERANK.cut).toEqual({});
    expect(VARIANT_RERANK.filter.mode).toBe('filter');
    expect(VARIANT_RERANK.filter.instruct).toBeTruthy();
  });
});

describe('resolveComparisons', () => {
  it('defaults to the cut comparisons when the env var is unset or empty', () => {
    expect(resolveComparisons({})).toEqual(COMPARISONS);
    expect(resolveComparisons({ EVAL_ANSWER_COMPARISONS: '' })).toEqual(COMPARISONS);
    expect(COMPARISONS.map((c) => c.id)).toEqual(['cut-vs-today', 'cut-vs-none']);
  });

  it('selects comparisons named in the env var, in ALL_COMPARISONS order', () => {
    const selected = resolveComparisons({ EVAL_ANSWER_COMPARISONS: 'filter-vs-today' });
    expect(selected).toEqual([{ id: 'filter-vs-today', challenger: 'filter', baseline: 'today' }]);
  });

  it('falls back to the default when every named id is unknown', () => {
    expect(resolveComparisons({ EVAL_ANSWER_COMPARISONS: 'not-a-real-id' })).toEqual(COMPARISONS);
  });

  it('ALL_COMPARISONS still carries the pre-2026-09-03 filter comparison', () => {
    expect(ALL_COMPARISONS.map((c) => c.id)).toContain('filter-vs-today');
  });
});
