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

import { cortecsBaseUrl } from './cortecsEndpoint.js';
import { cortecsFetchWithPolicy } from './cortecsRequestPolicy.js';
import { greenptFetchWithThinkingDisabled } from './greenptThinkingFetch.js';
import { litellmFetchWithThinkingDisabled } from './litellmThinkingFetch.js';
import { meliousFetch } from './meliousThinkingFetch.js';

import type { LanguageModel } from 'ai';

const log = createLogger('providerInstances');

export const LITELLM_DEFAULT_BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';
export const MELIOUS_BASE_URL = 'https://api.melious.ai/v1';
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
 *   /v1/audio/voices. The first two keep using `MISTRAL_GLOBAL_API_URL`.
 *   /v1/audio/voices no longer matters: the speech synthesis moved to
 *   KugelAudio (`services/voice/ttsService.ts`) and the global client it was
 *   the sole reason for is gone.
 */
export const MISTRAL_GLOBAL_API_URL = 'https://api.mistral.ai/v1';
export const MISTRAL_EU_API_URL = 'https://api.eu.mistral.ai/v1';
export const MISTRAL_API_URL =
  env.MISTRAL_REGION === 'global' ? MISTRAL_GLOBAL_API_URL : MISTRAL_EU_API_URL;

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let meliousInstance: ReturnType<typeof createOpenAI> | null = null;
let greenptInstance: ReturnType<typeof createOpenAI> | null = null;
let cortecsInstance: ReturnType<typeof createOpenAI> | null = null;

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
 * Die eine Tür für Mistral-Chatmodelle. `@ai-sdk/mistral` sendet
 * `reasoningEffort` nur für IDs auf seiner Allowlist und verwirft es sonst
 * still; `mistral-large-4` steht dort seit 4.0.59 — davor lief hier ein
 * fetch-Wrapper (#4192). `mistralReasoningEffort.vitest.ts` prüft den Body.
 */
export function getMistralChatModel(modelId: string): LanguageModel {
  return getMistralProvider()(modelId);
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

/**
 * Melious. Its chat-completions API is OpenAI-compatible and routes requests
 * between European inference providers. The model's `:balanced` suffix is part
 * of the model id (not a provider option), therefore callers can still choose
 * another documented Melious routing flavor explicitly when needed.
 */
export function getMeliousProvider(): ReturnType<typeof createOpenAI> {
  if (!meliousInstance) {
    const apiKey = env.MELIOUS_API_KEY;
    if (!apiKey) {
      throw new Error('MELIOUS_API_KEY environment variable is required');
    }
    meliousInstance = createOpenAI({
      baseURL: MELIOUS_BASE_URL,
      apiKey,
      name: 'melious',
      fetch: meliousFetch,
    });
  }
  return meliousInstance;
}

/**
 * GreenPT. Throws without a key — callers that want a fallback must ask for it
 * explicitly (see `isProviderConfigured`), not receive a different provider silently.
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
 * Cortecs Sky Inference — der Host der Gemma-Lane seit 21.08.2026.
 *
 * WAS DIESER UMZUG IST UND WAS NICHT. Cortecs vermittelt `gemma-4-26b-a4b-it`
 * gemessen an SCALEWAY (Header `x-cortecs-provider`, 21.08.2026) — dieselben
 * Gewichte auf derselben Hardware, ein Vermittler davor. Der Wechsel betrifft
 * also den Vertragspartner, nicht den Verarbeitungsort: für
 * `services/usage/energyFootprint.ts` und die Datenschutzerklärung bleibt
 * Paris/DC5 die richtige Auskunft, solange der Header das sagt.
 *
 * Wer die Modell-Liste erweitert, prüft den Header nach: die Zuordnung
 * Modell → Unteranbieter ist Cortecs' Entscheidung, nicht unsere. Elf der 25
 * Katalogmodelle lagen an dem Tag auf Scaleway, andere auf `mistral`,
 * `infercom` und `ovh`.
 *
 * Der `fetch` trägt zweierlei: den modellabhängigen Denk-Pin und die
 * Souveränitäts-Weisung (nur Unterauftragnehmer mit Zero Data Retention in der
 * EU/im EWR), samt Nachprüfung am Antwort-Header. Warum beides dort und nicht
 * bei den Aufrufern steht — und warum der Filter allein nicht trägt — steht in
 * cortecsRequestPolicy.ts.
 *
 * Wirft ohne Schlüssel, aus demselben Grund wie GreenPT: ein
 * Aufrufer landet nicht durch stille Ersetzung woanders.
 */
export function getCortecsProvider(): ReturnType<typeof createOpenAI> {
  if (!cortecsInstance) {
    const apiKey = env.CORTECS_API_KEY;
    if (!apiKey) {
      throw new Error('CORTECS_API_KEY environment variable is required');
    }
    cortecsInstance = createOpenAI({
      baseURL: cortecsBaseUrl(),
      apiKey,
      name: 'cortecs',
      fetch: cortecsFetchWithPolicy,
    });
  }
  return cortecsInstance;
}

export interface RouteOptions {
  /**
   * Veto des Aufrufers gegen ein AUSWEICH-Ziel. Greift nur, wenn das Primär als
   * zäh vermerkt ist und die Kette in `modelSiblings` ein Ersatzpaar sucht —
   * das Primär selbst wählt der Aufrufer ohnehin. Zweck: eine Slot-Regel, die
   * eine Ebene höher fällt (z. B. AVOID_AS_SYNTH), gilt auch für den Ausweich.
   */
  acceptTarget?: (target: { provider: string; model: string }) => boolean;
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
    case 'cortecs':
      return !!env.CORTECS_API_KEY;
    case 'litellm':
      // The base URL has a default, so only the key is a hard requirement.
      return !!env.LITELLM_API_KEY;
    case 'melious':
      return !!env.MELIOUS_API_KEY;
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
  const lanes = ['mistral', 'litellm', 'melious', 'greenpt', 'cortecs']
    .map((p) => `${p}=${isProviderConfigured(p) ? 'ok' : 'not configured'}`)
    .join(' · ');
  log.info(`Provider availability: ${lanes}`);
}
