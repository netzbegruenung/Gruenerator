/**
 * Unified AI Provider Configuration
 * Centralizes all AI provider management using Vercel AI SDK
 *
 * This module provides a single source of truth for:
 * - Provider instantiation (Mistral, LiteLLM, Regolo)
 * - Model selection based on provider
 * - Provider availability checking
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import { env } from '../../config/env.js';

import { regoloFetchWithThinkingDisabled } from './regoloThinkingFetch.js';

import type { LanguageModel } from 'ai';

// Provider name types
export type ProviderName = 'mistral' | 'litellm' | 'regolo';

// Default models per provider
const PROVIDER_DEFAULTS = {
  mistral: 'mistral-medium-2604',
  litellm: 'verdigado-pro',
  regolo: env.REGOLO_DEFAULT_MODEL ?? 'qwen3.5-122b',
} as const;

/**
 * Central config for all intermediate/agent processing tasks.
 * Change this once to switch all intermediate tasks to a different provider/model.
 */
export const INTERMEDIATE_MODEL = {
  provider: 'regolo' as const,
  model: 'mistral-small-4-119b',
};

export function getIntermediateModel(): LanguageModel {
  return getModel(INTERMEDIATE_MODEL.provider, INTERMEDIATE_MODEL.model);
}

export const LITELLM_DEFAULT_BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';
export const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
export const MISTRAL_API_URL = 'https://api.mistral.ai/v1';

// Singleton provider instances
let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;

/**
 * Get the Mistral provider instance (singleton)
 */
function getMistralProvider(): ReturnType<typeof createMistral> {
  if (!mistralInstance) {
    const apiKey = env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is required');
    }
    mistralInstance = createMistral({ apiKey });
  }
  return mistralInstance;
}

/**
 * Get the LiteLLM provider instance (singleton)
 * Uses OpenAI-compatible API
 */
function getLiteLLMProvider(): ReturnType<typeof createOpenAI> {
  if (!litellmInstance) {
    const baseURL = env.LITELLM_BASE_URL ?? LITELLM_DEFAULT_BASE_URL;
    const apiKey = env.LITELLM_API_KEY;
    litellmInstance = createOpenAI({
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      apiKey: apiKey ?? '',
      name: 'litellm',
    });
  }
  return litellmInstance;
}

/**
 * Get the Regolo provider instance (singleton)
 * Uses OpenAI-compatible API at api.regolo.ai
 */
function getRegoloProvider(): ReturnType<typeof createOpenAI> {
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
 * Check if a provider is configured and available
 */
export function isProviderConfigured(provider: ProviderName | string): boolean {
  switch (provider) {
    case 'mistral':
      return env.MISTRAL_API_KEY != null;
    case 'litellm':
      return env.LITELLM_API_KEY != null;
    case 'regolo':
      return env.REGOLO_API_KEY != null;
    default:
      return false;
  }
}

/**
 * Preferred provider for background monitor generation: litellm (gpt-oss)
 * when configured, Mistral otherwise.
 */
export function getPreferredMonitorProvider(): ProviderName {
  return isProviderConfigured('litellm') ? 'litellm' : 'mistral';
}

/**
 * Get a language model instance for the specified provider and model
 */
export function getModel(provider: ProviderName | string, modelId?: string): LanguageModel {
  switch (provider) {
    case 'mistral': {
      const mistral = getMistralProvider();
      return mistral(modelId || PROVIDER_DEFAULTS.mistral);
    }
    case 'litellm': {
      const litellm = getLiteLLMProvider();
      return litellm.chat(modelId || PROVIDER_DEFAULTS.litellm);
    }
    case 'regolo': {
      const regolo = getRegoloProvider();
      return regolo.chat(modelId || PROVIDER_DEFAULTS.regolo);
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
  return 'mistral';
}
