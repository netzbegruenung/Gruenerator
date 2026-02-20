/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import type { AgentConfig } from './types.js';
import type { LanguageModel } from 'ai';

const LITELLM_DEFAULT_MODEL = 'gpt-oss:120b';

/**
 * Available models that can be selected by the user.
 * Maps user-facing model IDs to provider/model configurations.
 */
export const AVAILABLE_MODELS: Record<string, { provider: 'mistral' | 'litellm'; model: string }> =
  {
    // 'mistral' is intentionally absent — it uses agent defaults (like 'auto')
    // Legacy IDs kept for backward compatibility (old stored client preferences)
    'mistral-large': { provider: 'mistral', model: 'mistral-large-latest' },
    'mistral-medium': { provider: 'mistral', model: 'mistral-medium-latest' },
    'pixtral-large': { provider: 'mistral', model: 'pixtral-large-latest' },
    litellm: { provider: 'litellm', model: 'gpt-oss:120b' },
  };

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(
  modelId: string
): { provider: 'mistral' | 'litellm'; model: string } | null {
  return AVAILABLE_MODELS[modelId] || null;
}

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;

function getMistralProvider() {
  if (!mistralInstance) {
    mistralInstance = createMistral({
      apiKey: process.env.MISTRAL_API_KEY,
    });
  }
  return mistralInstance;
}

function getLiteLLMProvider() {
  if (!litellmInstance) {
    const baseURL = process.env.LITELLM_BASE_URL;
    if (!baseURL) {
      throw new Error('LITELLM_BASE_URL is not configured');
    }
    litellmInstance = createOpenAI({
      baseURL: `${baseURL}/v1`,
      apiKey: process.env.LITELLM_API_KEY || '',
      name: 'litellm',
    });
  }
  return litellmInstance;
}

export function isProviderConfigured(provider: AgentConfig['provider']): boolean {
  let configured = false;
  switch (provider) {
    case 'mistral':
      configured = !!process.env.MISTRAL_API_KEY;
      console.log(
        `[providers] Checking mistral: MISTRAL_API_KEY=${configured ? 'set' : 'NOT SET'}`
      );
      return configured;
    case 'litellm':
      const hasBaseUrl = !!process.env.LITELLM_BASE_URL;
      const hasApiKey = !!process.env.LITELLM_API_KEY;
      configured = hasBaseUrl && hasApiKey;
      console.log(
        `[providers] Checking litellm: BASE_URL=${hasBaseUrl ? 'set' : 'NOT SET'}, API_KEY=${hasApiKey ? 'set' : 'NOT SET'}`
      );
      return configured;
    case 'anthropic':
      return false;
    default:
      return false;
  }
}

export function getModel(provider: AgentConfig['provider'], modelId: string): LanguageModel {
  console.log(`[providers] getModel called: provider=${provider}, modelId=${modelId}`);
  switch (provider) {
    case 'mistral': {
      console.log(`[providers] Creating Mistral model: ${modelId}`);
      const mistral = getMistralProvider();
      const model = mistral(modelId);
      console.log(`[providers] Mistral model created successfully`);
      return model;
    }
    case 'litellm': {
      console.log(`[providers] Creating LiteLLM model with default: ${LITELLM_DEFAULT_MODEL}`);
      const litellm = getLiteLLMProvider();
      const model = litellm(LITELLM_DEFAULT_MODEL);
      console.log(`[providers] LiteLLM model created successfully`);
      return model;
    }
    case 'anthropic':
      throw new Error('Anthropic provider is not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getProviderName(provider: AgentConfig['provider']): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'litellm':
      return 'LiteLLM (GPT-OSS)';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return 'Unknown';
  }
}
