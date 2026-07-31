/**
 * The ONE construction site for every AI provider client.
 *
 * There used to be two, built independently: `services/ai/providers.ts` (worker
 * pool path) and `routes/chat/agents/providers.ts` (chat path). They drifted in
 * every way two copies can — different base-URL handling, different failure
 * modes for a missing key, and, most consequentially, different `fetch`
 * wrappers. The GreenPT thinking-disable wrapper had to be threaded into both
 * by hand; a fix applied to one and not the other is invisible until a user
 * reports empty answers on one surface only.
 *
 * This module owns the singletons and their construction. It deliberately does
 * NOT own:
 *   - model aliasing / `AVAILABLE_MODELS` (chat-facing catalogue),
 *   - context windows (`CTX_FULL`/`CTX_VERDIGADO` — measured, not datasheet),
 *   - overflow lanes and the Verdigado slot,
 *   - loop policy (`isAgenticToolCapable`, `prefersUnifiedLoop`, …).
 * Those are genuinely per-surface decisions and stay where they are.
 */
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { greenptFetchWithThinkingDisabled } from './greenptThinkingFetch.js';
import { litellmFetchWithThinkingDisabled } from './litellmThinkingFetch.js';
import { regoloFetchWithThinkingDisabled } from './regoloThinkingFetch.js';
import { scalewayBaseUrl } from './scalewayEndpoint.js';
import { scalewayFetchWithMistralFallback } from './scalewayMistralFallbackFetch.js';

const log = createLogger('providerInstances');

export const LITELLM_DEFAULT_BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';
export const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
export const GREENPT_BASE_URL = 'https://api.greenpt.ai/v1';

/**
 * Mistral regional inference.
 *
 * `MISTRAL_API_URL` is the regional endpoint (EU by default): requests are
 * processed in EU/EFTA data centres and the payload never leaves the region —
 * which is what the Datenschutz page already promises users. Billed at 1.1×
 * list price.
 *
 * Probed against both endpoints on 2026-07-31 with our production key:
 *   EU serves the identical 60-model catalogue (zero models missing) and
 *   /v1/chat/completions incl. function calling, /v1/embeddings (byte-identical
 *   vectors to global — no Qdrant re-index needed), /v1/ocr and
 *   /v1/audio/{transcriptions,speech} all work.
 *   404 "no Route matched" on EU: /v1/files, /v1/conversations (Agents) and
 *   /v1/audio/voices. Those three keep using `MISTRAL_GLOBAL_API_URL` — see
 *   `mistralGlobalClient` in `workers/mistralClient.ts` for who and why.
 */
export const MISTRAL_GLOBAL_API_URL = 'https://api.mistral.ai/v1';
export const MISTRAL_EU_API_URL = 'https://api.eu.mistral.ai/v1';
export const MISTRAL_API_URL =
  env.MISTRAL_REGION === 'global' ? MISTRAL_GLOBAL_API_URL : MISTRAL_EU_API_URL;

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;
let greenptInstance: ReturnType<typeof createOpenAI> | null = null;
let scalewayInstance: ReturnType<typeof createOpenAI> | null = null;

/**
 * Mistral. Does NOT throw on a missing key — `createMistral` reads
 * `MISTRAL_API_KEY` from the environment itself, and the call fails at request
 * time with the provider's own error, which is more informative than ours.
 *
 * Chat completions and tool calling are fully supported regionally, so this
 * lane needs no global fallback.
 */
export function getMistralProvider(): ReturnType<typeof createMistral> {
  if (!mistralInstance) {
    mistralInstance = createMistral({
      baseURL: MISTRAL_API_URL,
      ...(env.MISTRAL_API_KEY && { apiKey: env.MISTRAL_API_KEY }),
    });
  }
  return mistralInstance;
}

/**
 * LiteLLM (verdigado). Falls back to the well-known base URL when
 * `LITELLM_BASE_URL` is unset — the previous chat-path behaviour of throwing
 * would take down the overflow lane on a config omission, where the worker path
 * happily used the default. The `/v1` suffix is appended only when absent, so
 * both `…/verdigado.net` and `…/verdigado.net/v1` work.
 */
export function getLiteLLMProvider(): ReturnType<typeof createOpenAI> {
  if (!litellmInstance) {
    const baseURL = env.LITELLM_BASE_URL ?? LITELLM_DEFAULT_BASE_URL;
    litellmInstance = createOpenAI({
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      apiKey: env.LITELLM_API_KEY ?? '',
      name: 'litellm',
      fetch: litellmFetchWithThinkingDisabled,
    });
  }
  return litellmInstance;
}

/** Regolo. Throws without a key — callers that want a fallback must ask for it
 *  explicitly (see `isProviderConfigured`), not receive a different provider
 *  silently. */
export function getRegoloProvider(): ReturnType<typeof createOpenAI> {
  if (!regoloInstance) {
    const apiKey = env.REGOLO_API_KEY;
    if (!apiKey) {
      throw new Error('REGOLO_API_KEY environment variable is required');
    }
    regoloInstance = createOpenAI({
      baseURL: REGOLO_BASE_URL,
      apiKey,
      name: 'regolo',
      fetch: regoloFetchWithThinkingDisabled,
    });
  }
  return regoloInstance;
}

/**
 * GreenPT. Throws without a key, same reasoning as Regolo.
 *
 * Model caveat (probed against all 25 servable models, 2026-07-24): the
 * thinking lanes (gemma4, glm-5.2, kimi-*, minimax-m2.5, qwen3.5/3.6, green-r,
 * gpt-oss-120b) put the chain of thought in `message.reasoning` — a field the
 * AI SDK drops — while it still bills against `max_tokens`, so a tight output
 * budget yields empty `content`. `greenptFetchWithThinkingDisabled` is the
 * mitigation; `reasoning_effort` is deliberately NOT sent (per-backend
 * enum-restricted — see that module).
 */
export function getGreenPTProvider(): ReturnType<typeof createOpenAI> {
  if (!greenptInstance) {
    const apiKey = env.GREENPT_API_KEY;
    if (!apiKey) {
      throw new Error('GREENPT_API_KEY environment variable is required');
    }
    greenptInstance = createOpenAI({
      baseURL: GREENPT_BASE_URL,
      apiKey,
      name: 'greenpt',
      fetch: greenptFetchWithThinkingDisabled,
    });
  }
  return greenptInstance;
}

/**
 * Scaleway Generative APIs (Paris).
 *
 * Deliberately NOT a `ProviderName`. Scaleway is the upstream that serves the
 * Mistral lane's model, not a lane of its own: every policy decision in the
 * codebase keys off `provider === 'mistral'` — whether the agentic tool loop is
 * allowed to run (`isAgenticToolCapable`), which context window applies, which
 * fallback chain a request gets — and introducing a sibling provider name would
 * have silently switched all of those OFF for the flagship model. Routing lives
 * one level below the name, in {@link routeMistralModel}.
 *
 * Throws without a key, same reasoning as Regolo: callers that want the Mistral
 * API instead must be routed there deliberately, not by a silent substitution.
 */
export function getScalewayProvider(): ReturnType<typeof createOpenAI> {
  if (!scalewayInstance) {
    const apiKey = env.SCALEWAY_API_KEY;
    if (!apiKey) {
      throw new Error('SCALEWAY_API_KEY environment variable is required');
    }
    scalewayInstance = createOpenAI({
      baseURL: scalewayBaseUrl(),
      apiKey,
      name: 'scaleway',
      fetch: scalewayFetchWithMistralFallback,
    });
  }
  return scalewayInstance;
}

/**
 * The Mistral models Scaleway serves, keyed by the id the codebase already
 * uses. `mistral-medium-2604` IS "Mistral Medium 3.5" (see
 * services/ai/modelDiscovery.ts); Scaleway publishes the same weights as
 * `mistral-medium-3.5-128b`.
 *
 * Only Medium is here. `pixtral-large-latest`, `mistral-small-latest` and the
 * embedding models are not served by this Scaleway project, so they must keep
 * going to the Mistral API — which is why this is a lookup table and not a
 * `startsWith('mistral-')` test.
 */
const SCALEWAY_MISTRAL_MODELS: Readonly<Record<string, string>> = {
  'mistral-medium-2604': 'mistral-medium-3.5-128b',
  'mistral-medium-3.5': 'mistral-medium-3.5-128b',
  'mistral-medium-latest': 'mistral-medium-3.5-128b',
};

export interface RoutedModel {
  /** Where the request actually goes — used for usage attribution. */
  upstream: 'mistral' | 'scaleway';
  /** The model id as the chosen upstream names it. */
  model: string;
}

export interface RouteOptions {
  /**
   * The caller intends to ask for thinking (`providerOptions.mistral.
   * reasoningEffort`). Forces the Mistral API — see {@link routeMistralModel}.
   */
  needsReasoning?: boolean;
}

/**
 * Where a request for a Mistral model should actually go.
 *
 * All Mistral Medium 3.5 traffic runs on Scaleway; the Mistral API is the
 * fallback, applied at three levels:
 *
 *  1. CONFIGURATION (here) — no Scaleway key, every caller stays on Mistral.
 *  2. CAPABILITY (here) — reasoning requests stay on Mistral, see below.
 *  3. REQUEST (`scalewayMistralFallbackFetch`) — a failed Scaleway call is
 *     replayed against Mistral.
 *
 * Callers pass the model id they already had; there is no new id to learn and
 * no call site to migrate. A model Scaleway does not serve falls through
 * untouched.
 *
 * WHY REASONING IS CARVED OUT (measured 2026-07-30). Scaleway serves the same
 * weights, and its `reasoning_effort` even has the same binary `['none','high']`
 * semantics that `mistralReasoningOption` already collapses to. But the lane
 * would be reached through `@ai-sdk/openai` rather than `@ai-sdk/mistral`, and
 * that costs the feature twice over:
 *
 *   - `providerOptions.mistral` never reaches an OpenAI-compat client, so the
 *     effort is dropped in silence — no error, no reasoning, nothing in the
 *     logs. `streamingProcessor.ts` documents this trap in the abstract; this
 *     is it in the concrete.
 *   - forcing `reasoning_effort: high` through anyway returns the chain of
 *     thought in `message.reasoning`, which the SDK does not read, while it
 *     still bills against `max_tokens` — a probe with an 800-token budget came
 *     back with EMPTY `content`. That is the GreenPT failure mode (see
 *     getGreenPTProvider) reproduced on a different host.
 *
 * So a thinking request goes to the Mistral API, where `@ai-sdk/mistral`
 * surfaces reasoning through `fullStream` as the chat UI expects. Everything
 * else — every generator, sheet, presentation, notebook, sharepic and
 * non-thinking chat turn — runs on Scaleway.
 */
export function routeMistralModel(
  modelId: string | undefined,
  options: RouteOptions = {}
): RoutedModel {
  const scalewayModel = modelId === undefined ? undefined : SCALEWAY_MISTRAL_MODELS[modelId];
  if (
    scalewayModel !== undefined &&
    options.needsReasoning !== true &&
    isProviderConfigured('scaleway')
  ) {
    return { upstream: 'scaleway', model: scalewayModel };
  }
  return { upstream: 'mistral', model: modelId ?? '' };
}

/**
 * Whether a provider has the configuration it needs.
 *
 * `anthropic` is deliberately always false: the Bedrock lane was removed and
 * the name survives only in vestigial regexes (see CLAUDE.md).
 */
export function isProviderConfigured(provider: string): boolean {
  switch (provider) {
    case 'mistral':
      // Either upstream can serve the lane, so the lane is configured if
      // EITHER key is present — a Scaleway-only deployment is valid.
      return !!env.MISTRAL_API_KEY || !!env.SCALEWAY_API_KEY;
    case 'scaleway':
      return !!env.SCALEWAY_API_KEY;
    case 'litellm':
      // The base URL has a default, so only the key is a hard requirement.
      return !!env.LITELLM_API_KEY;
    case 'regolo':
      return !!env.REGOLO_API_KEY;
    case 'greenpt':
      return !!env.GREENPT_API_KEY;
    case 'anthropic':
      return false;
    default:
      return false;
  }
}

/** One-shot startup log of which lanes are usable. Replaces a `console.log`
 *  that fired on EVERY `isProviderConfigured` call — several times per turn. */
let logged = false;
export function logProviderAvailability(): void {
  if (logged) return;
  logged = true;
  const lanes = ['mistral', 'litellm', 'regolo', 'greenpt', 'scaleway']
    .map((p) => `${p}=${isProviderConfigured(p) ? 'ok' : 'not configured'}`)
    .join(' · ');
  log.info(`Provider availability: ${lanes}`);
  log.info(
    isProviderConfigured('scaleway')
      ? `Mistral Medium 3.5 → Scaleway (fallback: ${env.MISTRAL_API_KEY ? 'Mistral API' : 'NONE — MISTRAL_API_KEY unset'})`
      : 'Mistral Medium 3.5 → Mistral API (SCALEWAY_API_KEY unset)'
  );
}
