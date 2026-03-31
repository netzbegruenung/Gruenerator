/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import type { AgentConfig } from './types.js';
import type { LanguageModel } from 'ai';

const LITELLM_DEFAULT_MODEL = 'gpt-oss:120b';

export const VISION_MODEL = {
  provider: 'regolo' as const,
  model: 'mistral-small-2503',
};

export const VISION_CAPABLE_MODELS = new Set(['pixtral-large-latest', 'mistral-small-2503']);

/**
 * Available models that can be selected by the user.
 * Maps user-facing model IDs to provider/model configurations.
 */
export const AVAILABLE_MODELS: Record<
  string,
  { provider: 'mistral' | 'litellm' | 'regolo'; model: string }
> = {
  // 'mistral' is intentionally absent — it uses agent defaults (like 'auto')
  // Legacy IDs kept for backward compatibility (old stored client preferences)
  'mistral-large': { provider: 'mistral', model: 'mistral-large-latest' },
  'mistral-medium': { provider: 'mistral', model: 'mistral-medium-latest' },
  'pixtral-large': { provider: 'mistral', model: 'pixtral-large-latest' },
  litellm: { provider: 'litellm', model: 'gpt-oss:120b' },
  regolo: { provider: 'regolo', model: process.env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b' },
};

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(
  modelId: string
): { provider: 'mistral' | 'litellm' | 'regolo'; model: string } | null {
  return AVAILABLE_MODELS[modelId] || null;
}

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;

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

function getRegoloProvider() {
  if (!regoloInstance) {
    const apiKey = process.env.REGOLO_API_KEY;
    if (!apiKey) {
      throw new Error('REGOLO_API_KEY is not configured');
    }
    regoloInstance = createOpenAI({
      baseURL: 'https://api.regolo.ai/v1',
      apiKey,
      name: 'regolo',
    });
  }
  return regoloInstance;
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
    case 'regolo':
      configured = !!process.env.REGOLO_API_KEY;
      console.log(`[providers] Checking regolo: REGOLO_API_KEY=${configured ? 'set' : 'NOT SET'}`);
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
      const model = litellm.chat(LITELLM_DEFAULT_MODEL);
      console.log(`[providers] LiteLLM model created successfully`);
      return model;
    }
    case 'regolo': {
      if (!process.env.REGOLO_API_KEY) {
        console.log(`[providers] REGOLO_API_KEY not set, falling back to Mistral: ${modelId}`);
        const mistral = getMistralProvider();
        return mistral(modelId);
      }
      const regoloDefault = process.env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
      console.log(`[providers] Creating Regolo model: ${modelId || regoloDefault}`);
      const regolo = getRegoloProvider();
      const model = regolo.chat(modelId || regoloDefault);
      console.log(`[providers] Regolo model created successfully`);
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
    case 'regolo':
      return 'Regolo AI';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return 'Unknown';
  }
}
