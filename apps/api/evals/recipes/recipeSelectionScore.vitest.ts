import { describe, expect, it } from 'vitest';

import { type RecipeSelectionCase } from './recipeSelectionCases.js';
import { gate, scoreCase, type ByGroup, type RunResult } from './recipeSelectionScore.js';

const run = (loaded: string[], n = 1): RunResult => ({
  caseId: 'x',
  run: n,
  loaded,
  lane: null,
  ms: 1,
});

const anyOfCase: RecipeSelectionCase = {
  id: 'x',
  prompt: 'p',
  group: 'kombi',
  expect: { anyOf: [['presse-beschluss'], ['presse', 'beschlusslage']] },
};
const noneCase: RecipeSelectionCase = {
  id: 'n',
  prompt: 'p',
  group: 'negativ',
  expect: { none: true },
};

describe('scoreCase', () => {
  it('counts a run when one anyOf list is fully loaded', () => {
    const runs = [
      run(['presse-beschluss']),
      run(['presse', 'beschlusslage', 'aktion']),
      run(['presse']),
    ];
    expect(scoreCase(anyOfCase, runs)).toEqual({ hits: 2, total: 3 });
  });

  it('counts a none run only when nothing was loaded', () => {
    expect(scoreCase(noneCase, [run([]), run(['presse']), run([])])).toEqual({ hits: 2, total: 3 });
  });
});

const full: ByGroup = {
  wortliste: { hits: 24, total: 24 },
  katalog: { hits: 24, total: 24 },
  negativ: { hits: 12, total: 12 },
  kombi: { hits: 12, total: 12 },
};

describe('gate', () => {
  it('passes at the fixed thresholds without baseline', () => {
    const g = gate(
      {
        ...full,
        wortliste: { hits: 22, total: 24 },
        katalog: { hits: 18, total: 24 },
        kombi: { hits: 8, total: 12 },
      },
      null
    );
    expect(g).toEqual({ pass: true, reasons: [] });
  });

  it('names every group below its threshold with the numbers', () => {
    const g = gate(
      {
        ...full,
        katalog: { hits: 15, total: 24 },
        negativ: { hits: 11, total: 12 },
        kombi: { hits: 7, total: 12 },
      },
      null
    );
    expect(g.pass).toBe(false);
    expect(g.reasons).toEqual(['katalog 15/24 < 18', 'negativ 11/12 < 12', 'kombi 7/12 < 8']);
  });

  it('holds wortliste to the baseline hits when a baseline exists', () => {
    const baseline: ByGroup = { ...full, wortliste: { hits: 23, total: 24 } };
    const g = gate({ ...full, wortliste: { hits: 22, total: 24 } }, baseline);
    expect(g.reasons).toEqual(['wortliste 22/24 < 23']);
  });
});
