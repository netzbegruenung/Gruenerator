/**
 * Provider-agnostic reasoning streamer for OpenAI-compatible chat-completions
 * endpoints that emit a model's thinking in a non-standard delta field.
 *
 * Why this exists: `@ai-sdk/openai` only bridges reasoning for the OpenAI
 * *Responses* API (`response.reasoning_summary_text.delta`). Its Chat
 * Completions delta schema has NO reasoning field at all, so any thinking that
 * an OpenAI-compat upstream streams alongside the answer is silently dropped.
 * Our upstreams do exactly that:
 *   - vLLM-style hosts (Melious): `delta.reasoning_content`, gesteuert über
 *     `reasoning_effort` (`none` schaltet ab).
 *   - Cortecs: `chat_template_kwargs.enable_thinking`.
 *   - Ollama-style: `delta.reasoning`, on by default.
 * To surface either to our UI (Reasoning/ReasoningGroup components), we bypass
 * the AI SDK for these reasoning-capable models and parse the raw SSE stream
 * ourselves, reading whichever reasoning field the upstream uses.
 */

import { env } from '../../config/env.js';
import { recordImpact, recordTokenUsage } from '../usage/UsageTrackingService.js';

import { cortecsBaseUrl } from './cortecsEndpoint.js';
import {
  assertSovereignUpstream,
  resolveCortecsUpstream,
  SOVEREIGN_ZDR_PROVIDERS,
} from './cortecsRequestPolicy.js';
import { createAnswerToolCallFilter, createGemmaChannelFilter } from './gemmaChannelFilter.js';
import { meliousBookedProvider, parseMeliousImpact } from './meliousImpact.js';
import { meliousWireModel } from './meliousThinkingFetch.js';
import { recordModelSample } from './modelHealth.js';
import { MELIOUS_BASE_URL } from './providerInstances.js';

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
}

/**
 * Models that stream reasoning to us, keyed by provider. LiteLLM's
 * Ollama-backed aliases emit `reasoning` by default and need no flag.
 */
/** Leer seit dem 29.08.2026: der Host bedient kein Ziel mehr, und `getModel`
 *  biegt den Namen vorher auf Cortecs um (./litellmRetired.ts). Das Set bleibt
 *  stehen, damit der Zweig unten symmetrisch zu den anderen Anbietern liest —
 *  und damit sichtbar ist, dass hier NICHTS mehr denkt, statt dass der Zweig
 *  ersatzlos fehlt. */
const LITELLM_REASONING_MODELS = new Set<string>();

/**
 * Denk-Hebel je Host für Gemma 4 31B — gemessen 09.11.2026, Rechenaufgabe,
 * 2–3 Läufe je Zeile, Reasoning-Tokens / erstes Antwort-Token (#5494):
 *
 *   Melious `:balanced`  nichts                  ~470   4,2–4,6 s  ← denkt von selbst
 *                        `reasoning_effort` none     0   0,2 s
 *                        low / medium / high   382–587   5,6–7,9 s  ← keine Stufe
 *                        enable_thinking=false       0   0,2 s
 *   Cortecs `-it`        nichts                      0   0,9 s
 *                        enable_thinking=true  485–620   1,7–3,5 s
 *                        `reasoning_effort` high ~530    2,0–3,4 s  (25.08.: wirkungslos)
 *                        `reasoning_effort` none     0   HTTP 200   (25.08.: 400)
 *                        `thinking_budget`      ignoriert
 *
 * Die Stufen sind auf keinem Host ein Regler: dieses Modul zu erreichen heisst
 * „denken an". Melious bekommt die Stufe trotzdem, weil sie dort „an" bedeutet;
 * Cortecs bekommt den binären Template-Schalter, der beide Richtungen sicher
 * trägt. Denken zählt gegen `max_tokens` (Cortecs, max_tokens 200: Inhalt
 * leer, `finish=length`).
 *
 * `:speed` und DeepSeek v4.1 Flash (Lane „Panda") folgen Melious' Hebel
 * (gemessen 06.11. bzw. 01.10.2026). Das Denken kommt als `reasoning_content`.
 */
const CORTECS_REASONING_MODELS = new Set(['gemma-4-31b-it']);

const MELIOUS_REASONING_MODELS = new Set([
  'gemma-4-31b:balanced',
  'gemma-4-31b:speed',
  'deepseek-v4.1-flash',
]);

export function isReasoningStreamModel(provider: string, model: string): boolean {
  if (provider === 'litellm') return LITELLM_REASONING_MODELS.has(model);
  if (provider === 'cortecs') return CORTECS_REASONING_MODELS.has(model);
  if (provider === 'melious') return MELIOUS_REASONING_MODELS.has(model);
  return false;
}

/**
 * Thrown when the upstream never served the request — a non-2xx BEFORE the
 * body is touched. Callers may safely retry on another lane, because nothing
 * has been streamed to the user yet. A stream that dies mid-flight throws a
 * plain Error instead and must NOT be retried: the tokens are already on
 * screen.
 */
export class ReasoningStreamUnavailableError extends Error {
  readonly status: number;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} reasoning stream unavailable: ${status} ${body.slice(0, 200)}`);
    this.name = 'ReasoningStreamUnavailableError';
    this.status = status;
  }
}

function resolveConfig(provider: string, effort?: ThinkingEffort): ReasoningStreamConfig | null {
  if (provider === 'cortecs') {
    return {
      endpoint: `${cortecsBaseUrl()}/chat/completions`,
      apiKey: env.CORTECS_API_KEY,
      // Die drei Souveränitäts-Felder MÜSSEN hier stehen und sind keine
      // Dopplung: dieser Pfad ist ein Roh-`fetch` und läuft NICHT durch
      // `cortecsFetchWithPolicy`. Ohne sie wäre ausgerechnet der Denk-Pfad der
      // eine, auf dem die ZDR-/EU-Weisung stillschweigend fehlt — und weil der
      // Filter fail-open ist, würde das von aussen wie ein wirksamer aussehen.
      //
      // `include_usage` gemessen 28.10.2026 auf beiden Upstreams (infercom und
      // gepinntem berget): HTTP 200, Usage-Block im letzten Chunk. Ohne ihn
      // verbuchte dieser Pfad für Cortecs keinen Token (#5108).
      bodyExtras: {
        chat_template_kwargs: { enable_thinking: true },
        stream_options: { include_usage: true },
        eu_native: true,
        allow_zero_data_retention: true,
        allowed_providers: SOVEREIGN_ZDR_PROVIDERS,
      },
    };
  }
  if (provider === 'melious') {
    return {
      endpoint: `${MELIOUS_BASE_URL}/chat/completions`,
      apiKey: env.MELIOUS_API_KEY,
      // `include_usage` gemessen 01.10.2026: Melious hängt den Usage-Block
      // (samt `prompt_tokens_details.cached_tokens`) als letzten Chunk an.
      // Ohne ihn verbucht dieser Pfad keinen einzigen Token — siehe unten.
      bodyExtras: {
        reasoning_effort: effort ?? 'high',
        stream_options: { include_usage: true },
      },
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
  const config = resolveConfig(params.provider, params.effort);
  if (!config) {
    throw new Error(`No reasoning-stream config for provider '${params.provider}'`);
  }
  if (!config.apiKey) {
    throw new Error(`API key for '${params.provider}' reasoning stream is not configured`);
  }
  if (!config.endpoint) {
    throw new Error(`Endpoint for '${params.provider}' reasoning stream is not configured`);
  }

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    ...(params.maxTokens != null && { max_tokens: params.maxTokens }),
    temperature: params.temperature,
    stream: true,
    ...config.bodyExtras,
  };
  if (params.provider === 'melious') body.model = meliousWireModel(body) ?? body.model;

  const startedAt = Date.now();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    ...(params.signal && { signal: params.signal }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new ReasoningStreamUnavailableError(params.provider, response.status, body);
  }

  // Dieselbe Nachprüfung, die `cortecsFetchWithPolicy` auf dem SDK-Pfad macht.
  // Sie steht hier ein zweites Mal, weil dieser Pfad roh fetcht: der
  // `allowed_providers`-Filter ist fail-open, also ist die Prüfung im
  // Nachhinein das Einzige, was einen unerlaubten Unterauftragnehmer überhaupt
  // sichtbar macht.
  if (params.provider === 'cortecs') {
    assertSovereignUpstream(response, typeof body.model === 'string' ? body.model : null);
  }
  // Gebucht wird der Upstream, nicht der Router — wie `effectiveProvider` in
  // usageModelMiddleware.ts: energyFootprint.ts schlüsselt PUE und Netzfaktor
  // nach `infercom`/`berget`, eine `cortecs`-Zeile bekäme keine CO₂-Zahl.
  const bookedProvider =
    params.provider === 'cortecs'
      ? (resolveCortecsUpstream(response.headers) ?? params.provider)
      : params.provider;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstTextAt: number | null = null;
  let usage: StreamUsage | null = null;
  // Melious' eigene Messung steht im letzten Chunk (gemessen 28.10.2026, auch
  // ohne `include_usage`). `recordImpact` bucht sie als gemessen; der
  // Koeffizient in energyFootprint.ts greift dann nur noch für den Rest.
  let impact: ReturnType<typeof parseMeliousImpact> = null;
  // Mit `enable_thinking` trennt der Host das Denken selbst; der Filter fängt
  // einen Upstream ohne Parser ab (Cortecs wechselt zwischen zweien).
  const channels = createGemmaChannelFilter();
  // Gemma also types tool calls as text here. No tool is mounted on this raw
  // path, so a call is cut out and only a long argument stays — live
  // 03.11.2026 a Mistral → Gemma fallback with reasoning on showed the whole
  // `<|tool_call>call:gruenerator:draft_structured{…}<tool_call|>` verbatim.
  const toolCalls = createAnswerToolCallFilter(new Set());

  try {
    read: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineBreak: number;
      while ((lineBreak = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        if (!line || !line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') break read;

        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        usage = extractUsage(parsed) ?? usage;
        if (params.provider === 'melious') impact = parseMeliousImpact(parsed) ?? impact;
        const delta = extractDelta(parsed);
        if (delta.reasoning) yield { type: 'reasoning', delta: delta.reasoning };
        const text = delta.text ? toolCalls.push(channels.push(delta.text)).text : '';
        if (text) {
          firstTextAt ??= Date.now();
          yield { type: 'text', delta: text };
        }
      }
    }
    const rest = toolCalls.push(channels.flush()).text + toolCalls.flush();
    if (rest) yield { type: 'text', delta: rest };
  } finally {
    reader.releaseLock();
    // Dieser Pfad ruft rohes `fetch` und geht damit an `withUsageTracking`
    // vorbei — ohne das hier wäre ausgerechnet die Lane mit der längsten
    // sichtbaren Wartezeit die einzige unbeobachtete.
    //
    // Durchsatz nur, wenn der Usage-Chunk kam (`include_usage`, beide Hosts
    // seit 28.10.2026). Aus Zeichen zu schätzen hiesse, für dasselbe Modell
    // zwei Einheiten in dieselbe Basislinie zu mischen.
    recordModelSample({
      provider: params.provider,
      model: params.model,
      outputTokens: usage?.outputTokens ?? 0,
      durationMs: Date.now() - startedAt,
      ttftMs: firstTextAt === null ? null : firstTextAt - startedAt,
      inputTokens: usage?.inputTokens ?? null,
    });
    // Melious nennt den Upstream erst im letzten Chunk; beide Zeilen gehen
    // dorthin, damit Messung und Tokens unter demselben Anbieter stehen.
    const provider = params.provider === 'melious' ? meliousBookedProvider(impact) : bookedProvider;
    if (usage) recordTokenUsage({ provider, model: params.model, ...usage });
    if (impact) {
      const { upstream: _upstream, ...measured } = impact;
      recordImpact({ provider, model: params.model, ...measured });
    }
  }
}

interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

function extractUsage(chunk: unknown): StreamUsage | null {
  const usage = (chunk as { usage?: Record<string, unknown> | null }).usage;
  if (!usage || typeof usage.prompt_tokens !== 'number') return null;
  const details = usage.prompt_tokens_details as { cached_tokens?: unknown } | null | undefined;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
    cachedInputTokens: typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0,
  };
}

function extractDelta(chunk: unknown): { text: string; reasoning: string } {
  const choices = (chunk as { choices?: Array<{ delta?: Record<string, unknown> }> }).choices;
  const delta = choices?.[0]?.delta ?? {};
  const text = typeof delta.content === 'string' ? delta.content : '';
  // vLLM-style hosts use `reasoning_content`; Ollama/LiteLLM use `reasoning`.
  const reasoning =
    typeof delta.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof delta.reasoning === 'string'
        ? delta.reasoning
        : '';
  return { text, reasoning };
}
