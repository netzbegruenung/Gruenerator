/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { AgentConfig } from './types.js';

const LITELLM_DEFAULT_MODEL = 'gpt-oss:120b';

/**
 * Available models that can be selected by the user.
 * Maps user-facing model IDs to provider/model configurations.
 */
export const AVAILABLE_MODELS: Record<string, { provider: 'mistral' | 'litellm'; model: string }> = {
  'mistral-large': { provider: 'mistral', model: 'mistral-large-latest' },
  'mistral-medium': { provider: 'mistral', model: 'mistral-medium-latest' },
  'pixtral-large': { provider: 'mistral', model: 'pixtral-large-latest' },
  'litellm': { provider: 'litellm', model: 'gpt-oss:120b' },
};

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(modelId: string): { provider: 'mistral' | 'litellm'; model: string } | null {
  return AVAILABLE_MODELS[modelId] || null;
}

const LITELLM_INCOMPATIBLE_PATTERNS = [
  /^mistral/i,
  /^claude/i,
  /^gpt-4/i,
  /^gpt-3/i,
  /^o1/i,
  /^o3/i,
];

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

function validateLiteLLMModel(modelId: string): string {
  for (const pattern of LITELLM_INCOMPATIBLE_PATTERNS) {
    if (pattern.test(modelId)) {
      console.warn(
        `[providers] Model "${modelId}" is incompatible with LiteLLM provider. ` +
          `Using default model "${LITELLM_DEFAULT_MODEL}" instead.`
      );
      return LITELLM_DEFAULT_MODEL;
    }
  }
  return modelId;
}

export function isProviderConfigured(provider: AgentConfig['provider']): boolean {
  let configured = false;
  switch (provider) {
    case 'mistral':
      configured = !!process.env.MISTRAL_API_KEY;
      console.log(`[providers] Checking mistral: MISTRAL_API_KEY=${configured ? 'set' : 'NOT SET'}`);
      return configured;
    case 'litellm':
      const hasBaseUrl = !!process.env.LITELLM_BASE_URL;
      const hasApiKey = !!process.env.LITELLM_API_KEY;
      configured = hasBaseUrl && hasApiKey;
      console.log(`[providers] Checking litellm: BASE_URL=${hasBaseUrl ? 'set' : 'NOT SET'}, API_KEY=${hasApiKey ? 'set' : 'NOT SET'}`);
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
      console.log(`[providers] Creating LiteLLM model: ${modelId}`);
      const litellm = getLiteLLMProvider();
      const validatedModel = validateLiteLLMModel(modelId);
      console.log(`[providers] LiteLLM validated model: ${validatedModel}`);
      const model = litellm(validatedModel);
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
