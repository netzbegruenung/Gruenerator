/**
 * Decision models: typed answers to closed questions, no generated text.
 *
 * Both hosts speak `POST /v1/systemone` — Melious runs Clef Flash itself,
 * GreenPT runs Metis. They return near-identical probabilities on every case
 * measured (`evals/metis/`, #5504), so they are one model behind two doors.
 *
 * A second way into the models next to `generate.ts`, and like `NoAnswerError`
 * there it classifies at its edge: when no host answers, the caller gets an
 * `AiProviderError`, never a bare `Error` (see CLAUDE.md, „Ein Weg zum Modell").
 *
 * HEDGED, not raced: Clef Flash is asked first; Metis only when it fails or has
 * not answered after `HEDGE_AFTER_MS`. Melious allows 240 requests a minute per
 * key, shared with every other Melious call — asking both every time would
 * spend that budget twice to shave a tail that is rare (2.0 s and 2.8 s once
 * each in ~400 calls; p90 140–270 ms).
 *
 * State shape matters more than the model: labelled plain text
 * („QUELLE: … BEHAUPTUNG: …") scored 97–100 %, the same content as a JSON
 * object 79–85 %. Callers pass a string.
 */
import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { AiProviderError, classifyProviderError } from '../providers/providerErrors.js';

import { GREENPT_BASE_URL, MELIOUS_BASE_URL } from './providerInstances.js';

const log = createLogger('ai:decide');

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Option label → what it means. */
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
  /** Margin of the winning option over the next one, 0–1. */
  confidence: number;
}

interface DecisionHost {
  name: string;
  url: string;
  model: string;
  apiKey: () => string | undefined;
}

const HOSTS: readonly DecisionHost[] = [
  {
    name: 'melious',
    url: `${MELIOUS_BASE_URL}/systemone`,
    model: 'clef-flash',
    apiKey: () => env.MELIOUS_API_KEY,
  },
  {
    name: 'greenpt',
    url: `${GREENPT_BASE_URL}/systemone`,
    model: 'metis',
    apiKey: () => env.GREENPT_API_KEY,
  },
];

const HEDGE_AFTER_MS = 400;
const DEFAULT_TIMEOUT_MS = 2_000;
/** Clef Flash's own limit (`_meta.capabilities.decision`); Metis allows more. */
export const DECISION_MAX_REQUEST_BYTES = 12_000;
export const DECISION_MAX_QUESTIONS = 32;

export interface DecideCall<K extends string> {
  /** Log prefix. */
  label: string;
  state: string;
  questions: Record<K, ChoiceQuestion>;
  timeoutMs?: number;
}

class DecisionHttpError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`systemone ${status}: ${body.slice(0, 200)}`);
    this.name = 'DecisionHttpError';
  }
}

function parseAnswers<K extends string>(
  raw: unknown,
  keys: readonly K[]
): Record<K, ChoiceAnswer> | null {
  const answers = (raw as { answers?: Record<string, unknown> } | null)?.answers;
  if (!answers) return null;
  const out = {} as Record<K, ChoiceAnswer>;
  for (const key of keys) {
    const a = answers[key] as Partial<ChoiceAnswer> | undefined;
    if (typeof a?.choice !== 'string' || typeof a.confidence !== 'number') return null;
    out[key] = { choice: a.choice, confidence: a.confidence, probabilities: a.probabilities ?? {} };
  }
  return out;
}

async function ask<K extends string>(
  host: DecisionHost,
  apiKey: string,
  call: DecideCall<K>,
  signal: AbortSignal
): Promise<Record<K, ChoiceAnswer>> {
  const res = await fetch(host.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: host.model, state: call.state, questions: call.questions }),
    signal,
  });
  if (!res.ok) throw new DecisionHttpError(res.status, await res.text());
  const answers = parseAnswers(await res.json(), Object.keys(call.questions) as K[]);
  if (!answers) throw new Error(`${host.name}: answer without every question`);
  return answers;
}

/**
 * Answers every question of `call` from one host, or throws `AiProviderError`.
 * Callers decide whether a failure blocks anything; a check fails open.
 */
export async function aiDecide<K extends string>(
  call: DecideCall<K>
): Promise<Record<K, ChoiceAnswer>> {
  const count = Object.keys(call.questions).length;
  const bytes = Buffer.byteLength(JSON.stringify({ state: call.state, questions: call.questions }));
  if (count === 0 || count > DECISION_MAX_QUESTIONS || bytes > DECISION_MAX_REQUEST_BYTES) {
    throw new AiProviderError(
      `[${call.label}] decision request out of bounds: ${count} questions, ${bytes} bytes`,
      { code: 'invalid_request', retryable: false }
    );
  }
  const hosts = HOSTS.flatMap((host) => {
    const apiKey = host.apiKey();
    return apiKey ? [{ host, apiKey }] : [];
  });
  if (!hosts.length) {
    throw new AiProviderError(`[${call.label}] no decision host configured`, {
      code: 'provider_unavailable',
      retryable: false,
    });
  }

  const deadline = AbortSignal.timeout(call.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controllers: AbortController[] = [];
  const errors: unknown[] = [];
  const started = Date.now();

  try {
    return await new Promise<Record<K, ChoiceAnswer>>((resolve, reject) => {
      let next = 0;
      let running = 0;
      let done = false;
      let hedge: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        done = true;
        if (hedge) clearTimeout(hedge);
      };
      const launch = () => {
        if (done || next >= hosts.length) return;
        const { host, apiKey } = hosts[next++]!;
        const controller = new AbortController();
        controllers.push(controller);
        running++;
        ask(host, apiKey, call, AbortSignal.any([controller.signal, deadline])).then(
          (answers) => {
            if (done) return;
            finish();
            log.debug(`[${call.label}] ${host.name} answered in ${Date.now() - started} ms`);
            resolve(answers);
          },
          (error: unknown) => {
            running--;
            if (done) return;
            errors.push(error);
            log.warn(`[${call.label}] ${host.name} failed: ${(error as Error).message}`);
            if (next < hosts.length) launch();
            else if (running === 0) {
              finish();
              reject(error);
            }
          }
        );
        if (next < hosts.length) {
          if (hedge) clearTimeout(hedge);
          hedge = setTimeout(launch, HEDGE_AFTER_MS);
        }
      };
      launch();
    });
  } catch (error) {
    // `DecisionHttpError.status` is what the classifier reads for 429/5xx/4xx.
    const last = errors.at(-1) ?? error;
    throw new AiProviderError(
      `[${call.label}] no decision host answered`,
      classifyProviderError(last),
      { cause: last }
    );
  } finally {
    for (const c of controllers) c.abort();
  }
}
