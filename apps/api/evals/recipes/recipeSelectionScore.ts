import { type RecipeSelectionCase } from './recipeSelectionCases.js';

export interface RunResult {
  caseId: string;
  run: number;
  loaded: string[];
  lane: string | null;
  ms: number;
}

export interface GroupScore {
  hits: number;
  total: number;
}
export type ByGroup = Record<RecipeSelectionCase['group'], GroupScore>;

/** Ein Lauf trifft, wenn eine `anyOf`-Liste ganz in `loaded` steckt (bei `none`: `loaded` leer). */
export function scoreCase(c: RecipeSelectionCase, runs: RunResult[]): GroupScore {
  const hit = (r: RunResult): boolean => {
    if (c.expect.none) return r.loaded.length === 0;
    return (c.expect.anyOf ?? []).some((list) => list.every((m) => r.loaded.includes(m)));
  };
  return { hits: runs.filter(hit).length, total: runs.length };
}

/** Schwellen aus dem Plan, bezogen auf 3 Läufe je Fall (24/24/12/12). */
const FALLBACK_WORTLISTE = 22;
const KATALOG_MIN = 18;
const NEGATIV_MIN = 12;
const KOMBI_MIN = 8;

export function gate(
  byGroup: ByGroup,
  baseline: ByGroup | null
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const check = (name: keyof ByGroup, min: number) => {
    if (byGroup[name].hits < min)
      reasons.push(`${name} ${byGroup[name].hits}/${byGroup[name].total} < ${min}`);
  };
  check('wortliste', baseline ? baseline.wortliste.hits : FALLBACK_WORTLISTE);
  check('katalog', KATALOG_MIN);
  check('negativ', NEGATIV_MIN);
  check('kombi', KOMBI_MIN);
  return { pass: reasons.length === 0, reasons };
}
