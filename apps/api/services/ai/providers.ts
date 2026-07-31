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
import {
  getGreenPTProvider,
  getLiteLLMProvider,
  getMistralProvider,
  getRegoloProvider,
  getScalewayProvider,
  isProviderConfigured,
  routeMistralModel,
} from './providerInstances.js';

import type { IntermediateLaneId } from './intermediateLanes.js';
import type { RouteOptions } from './providerInstances.js';
import type { LanguageModel } from 'ai';

// Provider name types
export type ProviderName = 'mistral' | 'litellm' | 'regolo' | 'greenpt';

// Default models per provider
const PROVIDER_DEFAULTS = {
  mistral: 'mistral-medium-2604',
  litellm: 'verdigado-pro',
  regolo: env.REGOLO_DEFAULT_MODEL ?? 'qwen3.5-122b',
  greenpt: env.GREENPT_DEFAULT_MODEL ?? 'mistral-medium-3.5-128b',
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
 * Preferred provider for background monitor generation: litellm (gpt-oss)
 * when configured, Mistral otherwise.
 */
export function getPreferredMonitorProvider(): ProviderName {
  return isProviderConfigured('litellm') ? 'litellm' : 'mistral';
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
  // Usage is attributed to the upstream that actually serves the request, not
  // to the lane name: with Mistral Medium 3.5 on Scaleway, billing the tokens
  // to "mistral" would make the Scaleway invoice unaccountable.
  const upstream =
    provider === 'mistral'
      ? routeMistralModel(modelId || PROVIDER_DEFAULTS.mistral, options).upstream
      : provider;
  return withUsageTracking(resolveModel(provider, modelId, options), upstream);
}

function resolveModel(
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
  return 'mistral';
}
