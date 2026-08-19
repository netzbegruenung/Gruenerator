/**
 * Unified AI Provider Configuration
 * Centralizes all AI provider management using Vercel AI SDK
 *
 * This module provides a single source of truth for:
 * - Provider instantiation (Mistral, LiteLLM, Regolo)
 * - Model selection based on provider
 * - Provider availability checking
 */

import { env } from '../../config/env.js';
import { withUsageTracking } from '../usage/usageModelMiddleware.js';

import { intermediateLane } from './intermediateLanes.js';
import { pickHealthyTarget } from './modelSiblings.js';
import {
  getGreenPTProvider,
  getLiteLLMProvider,
  getMistralProvider,
  getRegoloProvider,
  getScalewayProvider,
  getScalewayTextProvider,
  isProviderConfigured,
  routeMistralModel,
} from './providerInstances.js';
import { regoloTextDefault } from './textModelPolicy.js';

import type { IntermediateLaneId } from './intermediateLanes.js';
import type { RouteOptions } from './providerInstances.js';
import type { LanguageModel } from 'ai';

/**
 * Provider name types.
 *
 * `scaleway` is the newest member and the one with a caveat. Mistral Medium 3.5
 * runs on Scaleway WITHOUT being this provider — that lane stays `mistral` and
 * picks its upstream in `routeMistralModel`, because every policy check
 * (`isAgenticToolCapable`, `prefersUnifiedLoop`, the context windows, the
 * fallback chains) keys off `provider === 'mistral'` and a sibling name would
 * have switched all of it off for the main model. See CLAUDE.md.
 *
 * What `scaleway` IS for: models Scaleway serves that Mistral does not publish,
 * where no such policy applies. Today exactly one — Gemma 4 26B-A4B on the
 * `heavy` intermediate stage. A model that needs the mistral policy set does
 * NOT belong here.
 *
 * When adding a provider, note that most switches below carry a `default`
 * branch, so the compiler will NOT find the sites for you. The exhaustive ones
 * (`Record<ProviderName, …>` in services/ai/execution/execute.ts and
 * services/ai/modelDiscovery.ts) will; the rest are listed in the PR that
 * introduced this member.
 */
export type ProviderName = 'mistral' | 'litellm' | 'regolo' | 'greenpt' | 'scaleway';

// Default models per provider
const PROVIDER_DEFAULTS = {
  mistral: 'mistral-medium-2604',
  litellm: 'verdigado-pro',
  regolo: regoloTextDefault(),
  greenpt: env.GREENPT_DEFAULT_MODEL ?? 'mistral-medium-3.5-128b',
  // Gemma 4 26B-A4B. Named rather than inherited: Scaleway also serves
  // `mistral-medium-3.5-128b`, and an unnamed default here would quietly hand
  // the expensive model to a caller that asked for the cheap lane.
  scaleway: 'gemma-4-26b-a4b-it',
} as const;

/**
 * A language model for one of the intermediate stages.
 *
 * The lane is REQUIRED — the old parameterless `getIntermediateModel()` is what
 * put a thread title and `computeNode` on the same model, and a default value
 * here would rebuild exactly that. Which stage a caller belongs to is a
 * decision, not a fallback; `services/ai/intermediateLanes.ts` holds the table
 * and the measurements behind it.
 */
export function getIntermediateModel(lane: IntermediateLaneId): LanguageModel {
  const { provider, model } = intermediateLane(lane);
  return getModel(provider, model);
}

// Provider clients are constructed in ONE place — see ./providerInstances.ts
// for why (two copies drifted in base-URL handling, failure modes and, most
// consequentially, `fetch` wrappers). Re-exported here so the many existing
// importers of this module keep working.
export {
  LITELLM_DEFAULT_BASE_URL,
  REGOLO_BASE_URL,
  GREENPT_BASE_URL,
  MISTRAL_API_URL,
  isProviderConfigured,
  logProviderAvailability,
} from './providerInstances.js';

/**
 * Das Modell, mit dem der Monitor im Hintergrund schreibt.
 *
 * Lief bis 19.08.2026 auf litellm/verdigado-pro. Das Problem war nicht die
 * Qualität, sondern der geteilte Engpass: Verdigado hat EINEN Inferenz-Slot,
 * und derselbe Host bediente den stündlichen Monitor-Lauf, die GPT-OSS-Lanes
 * und (bis zum selben Tag) den Ausweg der Chat-Gemma-Lane. Ein Hintergrundlauf
 * darf einem wartenden Menschen nicht den Ausweichhost wegnehmen — deshalb
 * zieht der Monitor auf GreenPT um, und die Chat-Lanes behalten Regolo,
 * Scaleway und Verdigado für sich.
 *
 * `mistral-small-3.2-24b` und NICHT `gemma4`, obwohl beide auf GreenPT liegen:
 * GreenPTs Gemma denkt immer (~5.400 Zeichen, kein Flag schaltet es ab, siehe
 * `greenptThinkingFetch`), das Denken zählt gegen `maxOutputTokens`, und fünf
 * der neun Monitor-Aufrufe hier haben eine Decke von 1.500–2.000 — bei der
 * käme leerer Text zurück. Small denkt nicht und schreibt als
 * `LOOP_PLANNER_PRIMARY` auf genau diesem Host bereits produktiv.
 */
const MONITOR_GREENPT_MODEL = 'mistral-small-3.2-24b-instruct-2506';

export function getMonitorModel(): LanguageModel {
  if (isProviderConfigured('greenpt')) return getModel('greenpt', MONITOR_GREENPT_MODEL);
  return getModel('mistral');
}

/**
 * Get a language model instance for the specified provider and model.
 * The returned model is wrapped so its token usage is attributed to the
 * current request's user (no-op outside an authenticated request).
 */
export function getModel(
  provider: ProviderName | string,
  modelId?: string,
  options: RouteOptions = {}
): LanguageModel {
  // Ein zäh vermerktes Paar wird übersprungen statt abgewartet — siehe
  // services/ai/modelSiblings.ts. Ohne Vermerk ändert sich hier nichts.
  const healthy = pickHealthyTarget(provider, modelId || getDefaultModel(provider));
  const lane = healthy ?? { provider, model: modelId };

  // Usage is attributed to the upstream that actually serves the request, not
  // to the lane name: with Mistral Medium 3.5 on Scaleway, billing the tokens
  // to "mistral" would make the Scaleway invoice unaccountable.
  const upstream =
    lane.provider === 'mistral'
      ? routeMistralModel(lane.model || PROVIDER_DEFAULTS.mistral, options).upstream
      : lane.provider;
  return withUsageTracking(instantiateModel(lane.provider, lane.model, options), upstream);
}

function instantiateModel(
  provider: ProviderName | string,
  modelId?: string,
  options: RouteOptions = {}
): LanguageModel {
  switch (provider) {
    case 'mistral': {
      // Medium 3.5 runs on Scaleway; everything else Mistral publishes
      // (Pixtral, Small, embeddings) stays on the Mistral API, as do thinking
      // requests. See routeMistralModel for why this is not a ProviderName.
      const routed = routeMistralModel(modelId || PROVIDER_DEFAULTS.mistral, options);
      if (routed.upstream === 'scaleway') {
        return getScalewayProvider().chat(routed.model);
      }
      const mistral = getMistralProvider();
      return mistral(routed.model);
    }
    case 'litellm': {
      const litellm = getLiteLLMProvider();
      return litellm.chat(modelId || PROVIDER_DEFAULTS.litellm);
    }
    case 'regolo': {
      const regolo = getRegoloProvider();
      return regolo.chat(modelId || PROVIDER_DEFAULTS.regolo);
    }
    case 'greenpt': {
      const greenpt = getGreenPTProvider();
      return greenpt.chat(modelId || PROVIDER_DEFAULTS.greenpt);
    }
    case 'scaleway': {
      // Its own client, NOT the one routeMistralModel reaches: this one forces
      // `reasoning_effort: 'none'` on every request (scalewayThinkingFetch).
      // Gemma 4 26B-A4B thinks by default and answers with an EMPTY `content`
      // when it does — measured 2026-08-01, empty even at max_tokens 1500 after
      // 5386 characters of reasoning.
      const scaleway = getScalewayTextProvider();
      return scaleway.chat(modelId || PROVIDER_DEFAULTS.scaleway);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: ProviderName | string): string {
  switch (provider) {
    case 'mistral':
      return PROVIDER_DEFAULTS.mistral;
    case 'litellm':
      return PROVIDER_DEFAULTS.litellm;
    case 'regolo':
      return PROVIDER_DEFAULTS.regolo;
    case 'greenpt':
      return PROVIDER_DEFAULTS.greenpt;
    case 'scaleway':
      return PROVIDER_DEFAULTS.scaleway;
    default:
      return PROVIDER_DEFAULTS.mistral;
  }
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: ProviderName | string): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'litellm':
      return 'LiteLLM (GPT-OSS)';
    case 'regolo':
      return 'Regolo AI';
    case 'greenpt':
      return 'GreenPT';
    case 'scaleway':
      return 'Scaleway';
    default:
      return 'Unknown Provider';
  }
}

/**
 * Normalize provider name to canonical form
 */
export function normalizeProviderName(provider: string): ProviderName {
  const lower = provider.toLowerCase();
  if (lower === 'litellm') return 'litellm';
  if (lower === 'regolo') return 'regolo';
  if (lower === 'greenpt') return 'greenpt';
  if (lower === 'scaleway') return 'scaleway';
  return 'mistral';
}
