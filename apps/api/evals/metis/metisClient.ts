/**
 * Minimaler Client für `POST /v1/systemone` — dieselbe API bei GreenPT (Metis)
 * und Melious (Clef): ein Forward-Pass, je Frage eine Wahrscheinlichkeits-
 * verteilung, kein generierter Text. Fragen eines Requests werden gemeinsam
 * entschieden; unabhängige Turns gehören in getrennte Requests.
 * Doku: https://api.greenpt.ai, https://melious.ai/docs/reference/systemone —
 * Melious verlangt `instructions` an jeder Frage.
 */

export type MetisQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: Array<string | null> };

export interface MetisChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
export interface MetisNoulAnswer {
  type: 'noul';
  noul: number;
}
export interface MetisScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}
export type MetisAnswer = MetisChoiceAnswer | MetisNoulAnswer | MetisScoreAnswer;

export interface MetisResponse<Q extends string> {
  answers: Record<Q, MetisAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

/** Entscheidungsmodelle, je Anbieter: Basis-URL und Key-Variable. */
const DECISION_MODELS = {
  metis: {
    baseUrl: process.env.GREENPT_BASE_URL ?? 'https://api.greenpt.ai',
    key: 'GREENPT_API_KEY',
  },
  'clef-flash': { baseUrl: 'https://api.melious.ai', key: 'MELIOUS_API_KEY' },
  clef: { baseUrl: 'https://api.melious.ai', key: 'MELIOUS_API_KEY' },
} as const;
export type DecisionModel = keyof typeof DECISION_MODELS;
export const isDecisionModel = (m: string): m is DecisionModel => m in DECISION_MODELS;

export async function systemOne<Q extends string>(args: {
  state: unknown;
  questions: Record<Q, MetisQuestion>;
  model?: DecisionModel;
  timeoutMs?: number;
}): Promise<MetisResponse<Q>> {
  const model = args.model ?? 'metis';
  const { baseUrl, key } = DECISION_MODELS[model];
  const apiKey = process.env[key];
  if (!apiKey) throw new Error(`${key} fehlt (tsx --env-file=.env)`);
  const res = await fetch(`${baseUrl}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, state: args.state, questions: args.questions }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 10_000),
  });
  if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as MetisResponse<Q>;
}
