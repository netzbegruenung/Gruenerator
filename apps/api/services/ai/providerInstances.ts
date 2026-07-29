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

const log = createLogger('providerInstances');

export const LITELLM_DEFAULT_BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';
export const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
export const GREENPT_BASE_URL = 'https://api.greenpt.ai/v1';
export const MISTRAL_API_URL = 'https://api.mistral.ai/v1';

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;
let greenptInstance: ReturnType<typeof createOpenAI> | null = null;

/**
 * Mistral. Does NOT throw on a missing key — `createMistral` reads
 * `MISTRAL_API_KEY` from the environment itself, and the call fails at request
 * time with the provider's own error, which is more informative than ours.
 */
export function getMistralProvider(): ReturnType<typeof createMistral> {
  if (!mistralInstance) {
    mistralInstance = createMistral({
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
 * Whether a provider has the configuration it needs.
 *
 * `anthropic` is deliberately always false: the Bedrock lane was removed and
 * the name survives only in vestigial regexes (see CLAUDE.md).
 */
export function isProviderConfigured(provider: string): boolean {
  switch (provider) {
    case 'mistral':
      return !!env.MISTRAL_API_KEY;
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
  const lanes = ['mistral', 'litellm', 'regolo', 'greenpt']
    .map((p) => `${p}=${isProviderConfigured(p) ? 'ok' : 'not configured'}`)
    .join(' · ');
  log.info(`Provider availability: ${lanes}`);
}
