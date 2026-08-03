/**
 * Minimal OpenAI-compatible passthrough to verdigado/LiteLLM.
 *
 * Deliberately a raw `fetch` rather than the AI SDK: `@ai-sdk/openai`'s
 * Chat-Completions delta schema has no `reasoning` field, so the thinking
 * `verdigado-think` streams would be dropped on that path — the same gap
 * `regoloReasoningStream.ts` exists to work around. Piping the upstream bytes
 * is both less code and lossless for fields we do not model.
 *
 * Consumers bring their own agent loop (the Excel add-in has 20 Excel tools of
 * its own); this module only supplies model access.
 */

import { env } from '../../config/env.js';
import { getContextWindow } from '../../routes/chat/agents/providers.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { LITELLM_DEFAULT_BASE_URL } from './providerInstances.js';

const log = createLogger('litellmPassthrough');

/**
 * Die einzigen Modelle, die dieser Endpoint erreichen darf.
 *
 * Eine geschlossene Liste, nicht ein Durchreichen von LiteLLMs `/v1/models`:
 * dort stehen auch Embedding-Modelle (`nomic-embed-text`), die ein Client
 * ansonsten auswählt und die auf einen Chat-Request unbrauchbar antworten.
 * Und ein offener `model`-Parameter machte aus jedem API-Schlüssel einen
 * Generalzugang zu unserem LiteLLM-Konto.
 *
 * `gemma` fehlt bewusst — der Alias zeigt auf ein kleineres Modell mit einem
 * Achtel Kontext und ist auch im Chat-Stack aus der Auswahl genommen.
 */
export const ALLOWED_MODELS = ['verdigado-think', 'verdigado-pro'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * Anzeigenamen für die Modellauswahl im Client. Ein Client, der `/models`
 * abfragt, bekommt sonst nur die technischen Kennungen zu sehen.
 */
export const MODEL_LABELS: Record<AllowedModel, string> = {
  'verdigado-think': 'Gemma 4 31B',
  'verdigado-pro': 'GPT-OSS 120B',
};

/**
 * Gemma 4 ist Standard, nicht GPT-OSS: im Tool-Loop-Test gegen Excel-Tools
 * brauchte `verdigado-think` 3 Runden ohne Schema-Verstoß, `verdigado-pro`
 * 4 Runden mit zwei Enum-Verstößen und falsch gesetzten Bereichen. Wählbar
 * bleibt es trotzdem — für Fließtext ist es die stärkere Wahl.
 */
export const DEFAULT_MODEL: AllowedModel = 'verdigado-think';

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

/**
 * Verdigado's Ollama backend does NOT reject an oversized prompt — it truncates
 * silently and answers over the fragment (measured: `prompt_tokens: 65538` at
 * ~350k input, HTTP 200). Sourced from the chat stack's `CTX_VERDIGADO` so the
 * two can never drift apart.
 */
export const MAX_PROMPT_TOKENS = getContextWindow(null, 'litellm');

/**
 * Body keys that must never come from the client. LiteLLM honours some of these
 * as per-request routing overrides, which would let a caller point our
 * authenticated proxy at an arbitrary upstream.
 */
const FORBIDDEN_BODY_KEYS = new Set(['api_base', 'api_key', 'base_url', 'custom_llm_provider']);

/**
 * Rough char-to-token estimate over everything that occupies context — messages
 * AND tool definitions, since a 20-tool schema is a substantial share of the
 * prompt. Intentionally approximate: its only job is to catch the requests that
 * would otherwise be answered from a truncated prompt.
 */
export function estimatePromptTokens(body: Record<string, unknown>): number {
  const contextual = { messages: body.messages, tools: body.tools };
  return Math.ceil(JSON.stringify(contextual).length / 4);
}

export type PassthroughResult =
  { ok: true; response: Response } | { ok: false; status: number; error: string };

export async function forwardChatCompletion(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<PassthroughResult> {
  // `LITELLM_API_KEY` is `optional()` in the env schema and the shared provider
  // factory falls back to an empty Bearer. On a paid upstream that turns a
  // config omission into a stream of 401s, so this path refuses to start.
  const apiKey = env.LITELLM_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: 'Model backend is not configured' };
  }
  // Same base-URL handling as `getLiteLLMProvider`: fall back to the well-known
  // host, and append `/v1` only when it is not already there.
  const configured = env.LITELLM_BASE_URL ?? LITELLM_DEFAULT_BASE_URL;
  const baseUrl = configured.endsWith('/v1') ? configured : `${configured}/v1`;

  const forwarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!FORBIDDEN_BODY_KEYS.has(key)) forwarded[key] = value;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwarded),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (signal?.aborted) return { ok: false, status: 499, error: 'Client closed request' };
    // Der Rohtext gehört ins Log, nicht zum Client: ein fehlgeschlagener fetch
    // trägt die interne Adresse des Upstreams im Text ("connect ECONNREFUSED
    // 10.x.x.x:4000"). Für die aufrufende Seite ändert das nichts — sie kann
    // ohnehin nur neu versuchen.
    log.error('[litellm] upstream request failed: %s', err);
    return {
      ok: false,
      status: 502,
      error: toUserFacingMessage(err, 'Upstream request failed'),
    };
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    // A 401/403 from LiteLLM means OUR key is wrong, not the caller's. Passing
    // it through would tell the client to go re-check a key that is fine.
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    return {
      ok: false,
      status,
      error: detail.slice(0, 500) || `Upstream error ${response.status}`,
    };
  }

  return { ok: true, response };
}
