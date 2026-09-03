/**
 * Reine Funktionen und Formen der Antwort-Eval.
 *
 * Getrennt von den drei Skripten, weil die beim Import `dotenv`, Qdrant und
 * die halbe Suchmaschine hochfahren. Alles hier ist rein und testbar; kein
 * Modul in dieser Datei ruft je einen Anbieter.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** `none` schaltet den Reranker ab, `today` ist der ausgelieferte Zustand. */
export const ANSWER_VARIANTS = ['none', 'today', 'filter'] as const;
export type AnswerVariant = (typeof ANSWER_VARIANTS)[number];

/**
 * Der `de-strict`-Text aus `apps/api/evals/retrieval/rerankInstructs.ts` auf
 * `origin/feat/rerank-instruct-eval` (Commit aaced6c9, `RERANK_INSTRUCT_PRESETS`),
 * wortgleich übernommen. Kopiert statt importiert: die Datei liegt auf einem
 * anderen Branch, und ein Import daraus wäre hier nicht auflösbar.
 */
export const DE_STRICT_INSTRUCT =
  'Bewerte nur, ob die Passage die Frage direkt beantwortet. ' +
  'Thematische Nähe ohne Antwort zählt nicht.';

export interface RerankVariantOptions {
  mode?: 'off' | 'sort' | 'filter';
  instruct?: string;
}

/** Was jede Variante an `handleNotebookStream({ rerank })` durchreicht. */
export const VARIANT_RERANK: Record<AnswerVariant, RerankVariantOptions> = {
  none: { mode: 'off' },
  today: {},
  filter: { mode: 'filter', instruct: DE_STRICT_INSTRUCT },
};

export interface AnswerCitation {
  title: string;
  url: string | null;
}

export interface AnswerRecord {
  caseId: string;
  variant: AnswerVariant;
  question: string;
  answer: string;
  citations: AnswerCitation[];
  durationMs: number;
  /** Dichter Spitzenwert VOR dem Rerank; `null`, wenn kein Kandidat kam. */
  evidenceTop: number | null;
}

export function answerKey(caseId: string, variant: AnswerVariant): string {
  return `${caseId}::${variant}`;
}

/**
 * Fisher-Yates auf einer Kopie.
 *
 * Der Grund für die Mischung ist nicht Statistik, sondern die Uhr: drei
 * Varianten hintereinander in fester Reihenfolge legen jeder Variante dieselbe
 * Position im Zeitfenster zu, und ein Anbieter, der abends langsamer oder
 * knapper antwortet, sähe dann aus wie ein Effekt der Variante.
 */
export function shuffleVariants(
  rng: () => number,
  variants: readonly AnswerVariant[] = ANSWER_VARIANTS
): AnswerVariant[] {
  const out = [...variants];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export interface Comparison {
  id: string;
  challenger: AnswerVariant;
  baseline: AnswerVariant;
}

export const COMPARISONS: readonly Comparison[] = [
  { id: 'filter-vs-today', challenger: 'filter', baseline: 'today' },
  { id: 'filter-vs-none', challenger: 'filter', baseline: 'none' },
];

export type AbSide = 'A' | 'B';
export type JudgeWinner = AbSide | 'tie';

/** Welche Variante hinter A bzw. B steckt. Wird gespeichert, nie gezeigt. */
export interface AbMapping {
  A: AnswerVariant;
  B: AnswerVariant;
}

export function buildAbMapping(
  challenger: AnswerVariant,
  baseline: AnswerVariant,
  coin: number
): AbMapping {
  return coin < 0.5 ? { A: challenger, B: baseline } : { A: baseline, B: challenger };
}

/** Von der Seite zurück auf die Variante — die Rückrichtung der Zuordnung. */
export function resolveWinner(mapping: AbMapping, winner: JudgeWinner): AnswerVariant | 'tie' {
  return winner === 'tie' ? 'tie' : mapping[winner];
}

/** Von der Variante auf die Seite. `null`, wenn sie in diesem Paar nicht vorkommt. */
export function sideOf(mapping: AbMapping, variant: AnswerVariant): AbSide | null {
  if (mapping.A === variant) return 'A';
  if (mapping.B === variant) return 'B';
  return null;
}

export interface Tally {
  n: number;
  wins: number;
  ties: number;
  losses: number;
  winRate: number;
  tieRate: number;
  lossRate: number;
}

/**
 * Gewinnrate MIT Unentschieden im Nenner.
 *
 * Ein Unentschieden aus dem Nenner zu nehmen, macht jede knappe Messung
 * optisch deutlicher, als sie ist — bei einem Reranker, dessen erwarteter
 * Effekt klein ist, ist das genau die falsche Richtung. `winRate + tieRate +
 * lossRate` ist deshalb immer 1 (oder 0 bei leerer Menge).
 */
export function tally(
  winners: readonly (AnswerVariant | 'tie')[],
  challenger: AnswerVariant
): Tally {
  const n = winners.length;
  const wins = winners.filter((w) => w === challenger).length;
  const ties = winners.filter((w) => w === 'tie').length;
  const losses = n - wins - ties;
  const rate = (k: number): number => (n === 0 ? 0 : k / n);
  return {
    n,
    wins,
    ties,
    losses,
    winRate: rate(wins),
    tieRate: rate(ties),
    lossRate: rate(losses),
  };
}

/** Leere Menge → 0, damit ein Bericht nie `NaN` zeigt. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const scorePair = z.object({
  A: z.number().int().min(0).max(3),
  B: z.number().int().min(0).max(3),
});
const boolPair = z.object({ A: z.boolean(), B: z.boolean() });

export const judgeResultSchema = z.object({
  winner: z.enum(['A', 'B', 'tie']),
  answersQuestion: scorePair,
  groundedInSources: scorePair,
  inventedSource: boolPair,
  missingImportant: boolPair,
  rationale: z.string().min(1),
});

export type JudgeResult = z.infer<typeof judgeResultSchema>;

/**
 * Locker gehalten, wie `AiObjectCall.schema` es verlangt — die Strenge sitzt in
 * `validate`, das gegen `judgeResultSchema` prüft.
 */
export const judgeJsonSchema = zodToJsonSchema(judgeResultSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
}) as Record<string, unknown>;

export interface JudgmentRecord {
  caseId: string;
  comparisonId: string;
  challenger: AnswerVariant;
  baseline: AnswerVariant;
  mapping: AbMapping;
  /** Variante, die gewonnen hat — die aufgelöste Zuordnung. */
  winnerVariant: AnswerVariant | 'tie';
  result: JudgeResult;
}

/** ISO-Datum ohne Uhrzeit, die Namenskonvention aller Eval-Ausgaben hier. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
