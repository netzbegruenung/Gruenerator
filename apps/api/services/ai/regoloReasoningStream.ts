/**
 * Provider-agnostic reasoning streamer for OpenAI-compatible chat-completions
 * endpoints that emit a model's thinking in a non-standard delta field.
 *
 * Why this exists: `@ai-sdk/openai` only bridges reasoning for the OpenAI
 * *Responses* API (`response.reasoning_summary_text.delta`). Its Chat
 * Completions delta schema has NO reasoning field at all, so any thinking that
 * an OpenAI-compat upstream streams alongside the answer is silently dropped.
 * Two of our upstreams do exactly that:
 *   - Regolo / vLLM (Qwen3, gpt-oss, Gemma 4): `delta.reasoning_content`,
 *     gated behind the chat-template flag `enable_thinking`.
 *   - Verdigado / LiteLLM / Ollama (Gemma 4 `verdigado-think`):
 *     `delta.reasoning`, on by default.
 * To surface either to our UI (Reasoning/ReasoningGroup components), we bypass
 * the AI SDK for these reasoning-capable models and parse the raw SSE stream
 * ourselves, reading whichever reasoning field the upstream uses.
 *
 * The module name is historical — it began as Regolo-only; it now covers any
 * configured OpenAI-compat reasoning lane.
 */

import { env } from '../../config/env.js';

import { isProviderConfigured, SCALEWAY_MISTRAL_MODELS } from './providerInstances.js';
import { scalewayBaseUrl } from './scalewayEndpoint.js';

import type { ModelMessage } from 'ai';

export interface ReasoningStreamChunk {
  type: 'text' | 'reasoning';
  delta: string;
}

/** Reasoning strength for lanes that expose a dial. Lanes that only have
 *  on/off ignore it — reaching this module at all already means "on". */
export type ThinkingEffort = 'low' | 'medium' | 'high';

export interface ReasoningStreamParams {
  provider: string;
  model: string;
  messages: ModelMessage[];
  /** Optional output cap — omitted on answer paths (provider decides). */
  maxTokens?: number;
  temperature: number;
  signal?: AbortSignal;
  effort?: ThinkingEffort;
}

interface ReasoningStreamConfig {
  endpoint: string;
  apiKey: string | undefined;
  /** Extra request-body fields that switch the upstream into thinking mode. */
  bodyExtras: Record<string, unknown>;
  /**
   * The id the chosen upstream knows the model by, when it differs from the
   * lane's own id. Only the Mistral lane needs this: Scaleway serves the same
   * weights as `mistral-medium-3.5-128b`.
   */
  model?: string;
}

const REGOLO_ENDPOINT = 'https://api.regolo.ai/v1/chat/completions';

/**
 * Models that stream reasoning to us, keyed by provider. Regolo's vLLM family
 * needs `enable_thinking: true` (the inverse of the `regoloFetchWithThinkingDisabled`
 * default we apply on the SDK path); LiteLLM's Ollama-backed aliases
 * (`verdigado-think` = Gemma 4, `verdigado-pro` = gpt-oss) emit `reasoning` by
 * default and need no flag.
 */
const REGOLO_REASONING_MODELS = new Set([
  'qwen3.5-122b',
  'qwen3.6-27b',
  'gpt-oss-120b',
  'gemma4-31b',
  // Small 4 is reasoning-capable but ran with thinking hard-off everywhere
  // (it was only ever INTERMEDIATE_MODEL). The auto policy can now grade it up
  // to `low` on moderate/complex turns; without this entry that grading would
  // be silently ignored — the SDK path forces enable_thinking:false.
  'mistral-small-4-119b',
]);
const LITELLM_REASONING_MODELS = new Set(['verdigado-think', 'verdigado-pro']);

/**
 * Mistral Medium 3.5 on Scaleway, when Scaleway is configured.
 *
 * The `mistral` lane is the odd one out: Scaleway is an UPSTREAM, not a
 * `ProviderName` (see routeMistralModel), so the caller still holds
 * `provider: 'mistral'` and the lane's own id — the Scaleway swap happens
 * below it. This function therefore keys on the lane, and returns the id
 * Scaleway knows the same weights by.
 *
 * Measured 2026-07-31 against all three hosts that serve these weights:
 * Scaleway streams thinking as `delta.reasoning` (a plain string), which is
 * the shape `extractDelta` already reads for Ollama/LiteLLM — so this lane
 * needs no parser work. The Mistral API, by contrast, streams
 * `delta.content` as a block ARRAY (`[{type:'thinking',…}]`) that this module
 * cannot read at all; that asymmetry is why the fallback for this lane is the
 * `@ai-sdk/mistral` path and never a raw replay (see streamForResolution).
 *
 * Without a Scaleway key this returns null and the lane keeps its previous
 * behaviour — thinking served by the Mistral API through the SDK.
 */
function scalewayReasoningModel(model: string): string | null {
  if (!isProviderConfigured('scaleway')) return null;
  return SCALEWAY_MISTRAL_MODELS[model] ?? null;
}

export function isReasoningStreamModel(provider: string, model: string): boolean {
  if (provider === 'regolo') return REGOLO_REASONING_MODELS.has(model);
  if (provider === 'litellm') return LITELLM_REASONING_MODELS.has(model);
  if (provider === 'mistral') return scalewayReasoningModel(model) !== null;
  return false;
}

/**
 * Thrown when the upstream never served the request — a non-2xx BEFORE the
 * body is touched. Callers may safely retry on another lane, because nothing
 * has been streamed to the user yet. A stream that dies mid-flight throws a
 * plain Error instead and must NOT be retried: the tokens are already on
 * screen. Same rule, and the same reason, as scalewayMistralFallbackFetch.
 */
export class ReasoningStreamUnavailableError extends Error {
  readonly status: number;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} reasoning stream unavailable: ${status} ${body.slice(0, 200)}`);
    this.name = 'ReasoningStreamUnavailableError';
    this.status = status;
  }
}

/**
 * gpt-oss exposes a native low/medium/high `reasoning_effort` dial. The other
 * lanes only have on/off (a chat-template flag or nothing at all), so effort is
 * deliberately NOT sent to them — an unknown body field is a needless risk on a
 * strict upstream.
 */
const EFFORT_AWARE_MODELS = new Set(['gpt-oss-120b', 'verdigado-pro']);

function resolveConfig(
  provider: string,
  model: string,
  effort?: ThinkingEffort
): ReasoningStreamConfig | null {
  const effortExtra = effort && EFFORT_AWARE_MODELS.has(model) ? { reasoning_effort: effort } : {};

  if (provider === 'regolo') {
    return {
      endpoint: REGOLO_ENDPOINT,
      apiKey: env.REGOLO_API_KEY,
      bodyExtras: { chat_template_kwargs: { enable_thinking: true }, ...effortExtra },
    };
  }
  if (provider === 'litellm') {
    const base = env.LITELLM_BASE_URL;
    return {
      endpoint: base ? `${base}/v1/chat/completions` : '',
      apiKey: env.LITELLM_API_KEY,
      bodyExtras: { ...effortExtra },
    };
  }
  if (provider === 'mistral') {
    const scalewayModel = scalewayReasoningModel(model);
    if (!scalewayModel) return null;
    return {
      endpoint: `${scalewayBaseUrl()}/chat/completions`,
      apiKey: env.SCALEWAY_API_KEY,
      model: scalewayModel,
      // Medium 3.5's dial is BINARY, and all three hosts that serve these
      // weights reject `low`/`medium` with a 400 (measured 2026-07-31:
      // "supported values are: ['none','high']"). `effortExtra` is therefore
      // deliberately not spread here — reaching this module already means
      // "thinking on", which is exactly what 'high' encodes. This is the same
      // collapse mistralReasoningOption performs on the SDK path.
      bodyExtras: { reasoning_effort: 'high' },
    };
  }
  return null;
}

/**
 * Stream a chat completion from a reasoning-capable OpenAI-compat upstream,
 * yielding both text and reasoning deltas as they arrive. Throws on non-2xx,
 * misconfiguration, or aborted streams.
 */
export async function* streamWithReasoning(
  params: ReasoningStreamParams
): AsyncGenerator<ReasoningStreamChunk, void, unknown> {
  const config = resolveConfig(params.provider, params.model, params.effort);
  if (!config) {
    throw new Error(`No reasoning-stream config for provider '${params.provider}'`);
  }
  if (!config.apiKey) {
    throw new Error(`API key for '${params.provider}' reasoning stream is not configured`);
  }
  if (!config.endpoint) {
    throw new Error(`Endpoint for '${params.provider}' reasoning stream is not configured`);
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model ?? params.model,
      messages: params.messages,
      ...(params.maxTokens != null && { max_tokens: params.maxTokens }),
      temperature: params.temperature,
      stream: true,
      ...config.bodyExtras,
    }),
    ...(params.signal && { signal: params.signal }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new ReasoningStreamUnavailableError(params.provider, response.status, body);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineBreak: number;
      while ((lineBreak = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        if (!line || !line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = extractDelta(parsed);
        if (delta.reasoning) yield { type: 'reasoning', delta: delta.reasoning };
        if (delta.text) yield { type: 'text', delta: delta.text };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractDelta(chunk: unknown): { text: string; reasoning: string } {
  const choices = (chunk as { choices?: Array<{ delta?: Record<string, unknown> }> }).choices;
  const delta = choices?.[0]?.delta ?? {};
  const text = typeof delta.content === 'string' ? delta.content : '';
  // vLLM/Regolo use `reasoning_content`; Ollama/LiteLLM use `reasoning`.
  const reasoning =
    typeof delta.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof delta.reasoning === 'string'
        ? delta.reasoning
        : '';
  return { text, reasoning };
}
