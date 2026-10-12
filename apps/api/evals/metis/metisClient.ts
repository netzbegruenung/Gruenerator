/**
 * Minimaler Client für GreenPTs `POST /v1/systemone` (Metis): ein Forward-Pass,
 * je Frage eine Wahrscheinlichkeitsverteilung, kein generierter Text.
 * Doku: https://api.greenpt.ai — Fragen eines Requests werden gemeinsam
 * entschieden; unabhängige Turns gehören in getrennte Requests.
 */

export type MetisQuestion =
  | { type: 'noul'; instructions?: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions?: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions?: string; criteria: Array<string | null> };

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

const BASE_URL = process.env.GREENPT_BASE_URL ?? 'https://api.greenpt.ai';

export async function systemOne<Q extends string>(args: {
  state: unknown;
  questions: Record<Q, MetisQuestion>;
  timeoutMs?: number;
}): Promise<MetisResponse<Q>> {
  const apiKey = process.env.GREENPT_API_KEY;
  if (!apiKey) throw new Error('GREENPT_API_KEY fehlt (tsx --env-file=.env)');
  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'metis', state: args.state, questions: args.questions }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 10_000),
  });
  if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as MetisResponse<Q>;
}
