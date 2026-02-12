/**
 * Unified AI Provider Configuration
 * Centralizes all AI provider management using Vercel AI SDK
 *
 * This module provides a single source of truth for:
 * - Provider instantiation (Mistral, LiteLLM/IONOS)
 * - Model selection based on provider
 * - Provider availability checking
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import type { LanguageModel } from 'ai';

// Provider name types
export type ProviderName = 'mistral' | 'litellm' | 'ionos';

// Default models per provider
const PROVIDER_DEFAULTS = {
  mistral: 'mistral-large-2512',
  litellm: 'gpt-oss:120b',
  ionos: 'openai/gpt-oss-120b',
} as const;

const LITELLM_DEFAULT_BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';

// Models incompatible with LiteLLM/IONOS OpenAI-compatible endpoints
const LITELLM_INCOMPATIBLE_PATTERNS = [
  /^mistral/i,
  /^mixtral/i,
  /^claude/i,
  /^gpt-4/i,
  /^gpt-3/i,
  /^o1/i,
  /^o3/i,
  /^anthropic/i,
  /^bedrock/i,
];

// Singleton provider instances
let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let ionosInstance: ReturnType<typeof createOpenAI> | null = null;

/**
 * Get the Mistral provider instance (singleton)
 */
function getMistralProvider(): ReturnType<typeof createMistral> {
  if (!mistralInstance) {
    const apiKey = process.env.MISTRAL_API_KEY;
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
    const baseURL = process.env.LITELLM_BASE_URL || LITELLM_DEFAULT_BASE_URL;
    const apiKey = process.env.LITELLM_API_KEY;
    litellmInstance = createOpenAI({
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      apiKey: apiKey || '',
      name: 'litellm',
    });
  }
  return litellmInstance;
}

/**
 * Get the IONOS provider instance (singleton)
 * Uses OpenAI-compatible API
 */
function getIONOSProvider(): ReturnType<typeof createOpenAI> {
  if (!ionosInstance) {
    const apiKey = process.env.IONOS_API_TOKEN;
    if (!apiKey) {
      throw new Error('IONOS_API_TOKEN environment variable is required');
    }
    ionosInstance = createOpenAI({
      baseURL: 'https://openai.inference.de-txl.ionos.com/v1',
      apiKey,
      name: 'ionos',
    });
  }
  return ionosInstance;
}

/**
 * Validate and potentially replace a model ID for LiteLLM/IONOS compatibility
 */
function validateOpenAICompatibleModel(modelId: string, defaultModel: string): string {
  for (const pattern of LITELLM_INCOMPATIBLE_PATTERNS) {
    if (pattern.test(modelId)) {
      console.warn(
        `[providers] Model "${modelId}" is incompatible with OpenAI-compatible provider. ` +
          `Using default model "${defaultModel}" instead.`
      );
      return defaultModel;
    }
  }
  return modelId;
}

/**
 * Check if a provider is configured and available
 */
export function isProviderConfigured(provider: ProviderName | string): boolean {
  switch (provider) {
    case 'mistral':
      return !!process.env.MISTRAL_API_KEY;
    case 'litellm':
      return !!process.env.LITELLM_API_KEY;
    case 'ionos':
      return !!process.env.IONOS_API_TOKEN;
    default:
      return false;
  }
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
      const validatedModel = validateOpenAICompatibleModel(
        modelId || PROVIDER_DEFAULTS.litellm,
        PROVIDER_DEFAULTS.litellm
      );
      return litellm(validatedModel);
    }
    case 'ionos': {
      const ionos = getIONOSProvider();
      const validatedModel = validateOpenAICompatibleModel(
        modelId || PROVIDER_DEFAULTS.ionos,
        PROVIDER_DEFAULTS.ionos
      );
      return ionos(validatedModel);
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
    case 'ionos':
      return PROVIDER_DEFAULTS.ionos;
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
    case 'ionos':
      return 'IONOS (GPT-OSS)';
    default:
      return 'Unknown Provider';
  }
}

/**
 * Normalize provider name to canonical form
 */
export function normalizeProviderName(provider: string): ProviderName {
  const lower = provider.toLowerCase();
  if (lower === 'ionos') return 'ionos';
  if (lower === 'litellm') return 'litellm';
  return 'mistral';
}
