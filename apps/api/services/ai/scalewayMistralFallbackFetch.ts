/**
 * Mistral Medium 3.5 runs on Scaleway, with the Mistral API as its fallback.
 *
 * The fallback lives HERE, at the transport, rather than in a provider chain,
 * because the lane has no single entry point: roughly twenty call sites name
 * `mistral-medium-2604` directly (sheets, presentations, notebooks, canvas
 * edits, the chat tool loop, pandas compute, …) and only a handful of them run
 * inside `tryFallbackProviders`. A chain-level fallback would therefore cover
 * some callers and silently leave the rest with no failover at all. A fetch
 * wrapper covers every caller, streaming included, and needs no call-site edits.
 *
 * The replay is only ever attempted BEFORE the response body is touched, so a
 * stream that dies mid-flight is NOT retried — that would duplicate tokens the
 * user has already seen. It is a "Scaleway never answered" fallback, not a
 * "Scaleway answered badly" one.
 *
 * Verified 2026-07-30 that Mistral's own API accepts the OpenAI-shaped payload
 * this wrapper replays, forced tool calls included (`tool_choice: {type:
 * 'function', …}` → `finish_reason: tool_calls`). That equivalence is what makes
 * a transport-level swap safe; if it ever stops holding, the live test in
 * `__tests__/scalewayMistralFallback.vitest.ts` is what catches it.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scalewayFallback');

export const MISTRAL_OPENAI_BASE_URL = 'https://api.mistral.ai/v1';

/**
 * Scaleway model id → the Mistral API's name for the same weights.
 *
 * Only Mistral-published models can appear here. Scaleway's other lanes
 * (gpt-oss, qwen, gemma) have no Mistral equivalent, so a request for one is
 * left to fail on its own rather than being answered by a different model.
 */
const MISTRAL_EQUIVALENT: Readonly<Record<string, string>> = {
  'mistral-medium-3.5-128b': 'mistral-medium-2604',
};

/**
 * Statuses that mean "Scaleway did not serve this request", and Mistral might.
 *
 * 404 is deliberately included: if Scaleway retires or renames the model id,
 * every request 404s and the product is down on its primary lane. Failing over
 * keeps users working; the error-level log below is what makes it impossible to
 * miss. A 401/403 is NOT here — a bad key must stay loud, and Mistral quietly
 * absorbing the whole load would hide it until the bill arrives.
 */
function shouldFailover(status: number): boolean {
  return status === 404 || status === 408 || status === 409 || status === 429 || status >= 500;
}

function targetUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** The path under `/v1`, e.g. `chat/completions`. */
function endpointSuffix(url: string): string | null {
  const match = /\/v1\/(.+)$/.exec(url);
  return match?.[1] ?? null;
}

interface ReplayPlan {
  url: string;
  body: string;
  scalewayModel: string;
  mistralModel: string;
}

/**
 * Whether this exact request can be replayed against Mistral, and how.
 *
 * Returns null — meaning "no fallback, surface Scaleway's failure" — unless the
 * body is a JSON payload naming a model we have a Mistral equivalent for. The
 * `typeof body === 'string'` guard matters: a streamed or multipart body cannot
 * be replayed because it has already been consumed.
 */
function planReplay(input: RequestInfo | URL, init: RequestInit | undefined): ReplayPlan | null {
  if (!init?.body || typeof init.body !== 'string') return null;
  if (!env.MISTRAL_API_KEY) return null;

  const suffix = endpointSuffix(targetUrl(input));
  if (suffix === null) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }

  const scalewayModel = typeof parsed.model === 'string' ? parsed.model : null;
  if (scalewayModel === null) return null;

  const mistralModel = MISTRAL_EQUIVALENT[scalewayModel];
  if (mistralModel === undefined) return null;

  return {
    url: `${MISTRAL_OPENAI_BASE_URL}/${suffix}`,
    body: JSON.stringify({ ...parsed, model: mistralModel }),
    scalewayModel,
    mistralModel,
  };
}

async function replayOnMistral(plan: ReplayPlan, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${env.MISTRAL_API_KEY}`);
  headers.set('Content-Type', 'application/json');

  return fetch(plan.url, { ...init, headers, body: plan.body });
}

export const scalewayFetchWithMistralFallback: typeof fetch = async (input, init) => {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    // Transport failure: DNS, TLS, connection reset, or an aborted request.
    // An abort is the caller hanging up (user navigated away, timeout fired) —
    // replaying it would run a request nobody is waiting for, and bill for it.
    if (error instanceof Error && error.name === 'AbortError') throw error;

    const plan = planReplay(input, init);
    if (plan === null) throw error;

    log.warn(
      `Scaleway unreachable (${error instanceof Error ? error.message : String(error)}) — answering ${plan.scalewayModel} on Mistral (${plan.mistralModel})`
    );
    return replayOnMistral(plan, init ?? {});
  }

  if (response.ok || !shouldFailover(response.status)) return response;

  const plan = planReplay(input, init);
  if (plan === null) return response;

  // 404 means the model id itself is gone, which no amount of retrying fixes
  // and which nobody should have to notice from a latency graph.
  const level = response.status === 404 ? 'error' : 'warn';
  log[level](
    `Scaleway returned ${response.status} for ${plan.scalewayModel} — answering on Mistral (${plan.mistralModel})`
  );

  return replayOnMistral(plan, init ?? {});
};
