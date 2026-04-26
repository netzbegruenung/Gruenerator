/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import { env } from '../../../config/env.js';
import { litellmFetchWithThinkingDisabled } from '../../../services/ai/litellmThinkingFetch.js';
import { isVisionCapable } from '../../../services/ai/modelDiscovery.js';
import { regoloFetchWithThinkingDisabled } from '../../../services/ai/regoloThinkingFetch.js';

import type { AgentConfig } from './types.js';
import type { LanguageModel } from 'ai';

const LITELLM_DEFAULT_MODEL = 'gpt-oss:120b';

export const VISION_MODEL = {
  provider: 'regolo' as const,
  model: env.VISION_DEFAULT_MODEL || 'gemma4-31b',
};

export { INTERMEDIATE_MODEL, getIntermediateModel } from '../../../services/ai/providers.js';

export { isVisionCapable };

/**
 * Available models that can be selected by the user.
 * Maps user-facing model IDs to provider/model configurations.
 * contextWindow is in tokens — used by downstream context management to adapt budgets.
 */
export interface ModelConfig {
  provider: 'mistral' | 'litellm' | 'regolo';
  model: string;
  contextWindow: number;
  /**
   * User-facing model ID to fall back to when this model fails to produce
   * output (first-token timeout, empty completion, or upstream HTTP error).
   *
   * Chinese-trained models (Qwen) intentionally have NO fallback. The user
   * sees an explicit "Chinesisches Modell"-warning before selecting them
   * (informed-consent boundary in chatStore.ts MODEL_OPTIONS); auto-routing
   * either INTO or OUT OF Qwen would break that contract. Qwen failures must
   * surface as errors so the user can choose to retry or switch manually.
   */
  fallback?: string;
}

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  // 'mistral' is intentionally absent — it uses agent defaults (like 'auto')
  // Legacy IDs kept for backward compatibility (old stored client preferences)
  'mistral-large': { provider: 'mistral', model: 'mistral-large-latest', contextWindow: 128000 },
  'mistral-medium': { provider: 'mistral', model: 'mistral-medium-latest', contextWindow: 128000 },
  'pixtral-large': { provider: 'mistral', model: 'pixtral-large-latest', contextWindow: 128000 },
  litellm: {
    provider: 'litellm',
    model: 'gpt-oss:120b',
    contextWindow: 16384,
    fallback: 'gpt-oss-regolo',
  },
  regolo: {
    provider: 'regolo',
    model: env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b',
    contextWindow: 32768,
  },
  'gpt-oss-regolo': {
    provider: 'regolo',
    model: 'gpt-oss-120b',
    contextWindow: 32768,
    fallback: 'gemma-litellm',
  },
  // Chinese-trained models — no `fallback` field by design. See ModelConfig.
  'qwen-regolo': { provider: 'regolo', model: 'qwen3.5-122b', contextWindow: 32768 },
  'qwen3.6-regolo': { provider: 'regolo', model: 'qwen3.6-27b', contextWindow: 32768 },
};

const GEMMA_LITELLM: ModelConfig = {
  provider: 'litellm',
  model: 'gpt-oss:120b',
  contextWindow: 32768,
  fallback: 'gpt-oss-regolo',
};
AVAILABLE_MODELS['gemma-litellm'] = GEMMA_LITELLM;
// Legacy ID — old persisted client state may still send 'gemma-regolo'.
// Aliased to the LiteLLM-served gemma so requests don't hit Regolo's broken
// gemma4-31b endpoint. ChatStore migration upgrades the persisted ID on next
// page load.
AVAILABLE_MODELS['gemma-regolo'] = GEMMA_LITELLM;

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelId] || null;
}

/**
 * Default context window for Mistral agent defaults and unknown models.
 * Conservative enough to avoid overflow, generous enough for good responses.
 */
const DEFAULT_CONTEXT_WINDOW = 32768;

/**
 * Get context window size (in tokens) for a model.
 * Looks up AVAILABLE_MODELS first, then falls back to provider defaults.
 */
export function getContextWindow(
  modelId: string | null | undefined,
  provider?: 'mistral' | 'litellm' | 'regolo' | 'anthropic'
): number {
  if (modelId && AVAILABLE_MODELS[modelId]) {
    return AVAILABLE_MODELS[modelId].contextWindow;
  }

  // Provider-level defaults for agent configs that use 'auto' or unnamed models
  if (provider === 'mistral') return 128000;
  if (provider === 'litellm') return 16384;
  if (provider === 'regolo') return 32768;

  return DEFAULT_CONTEXT_WINDOW;
}

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;

function getMistralProvider() {
  if (!mistralInstance) {
    mistralInstance = createMistral({
      ...(env.MISTRAL_API_KEY && { apiKey: env.MISTRAL_API_KEY }),
    });
  }
  return mistralInstance;
}

function getLiteLLMProvider() {
  if (!litellmInstance) {
    const baseURL = env.LITELLM_BASE_URL;
    if (!baseURL) {
      throw new Error('LITELLM_BASE_URL is not configured');
    }
    litellmInstance = createOpenAI({
      baseURL: `${baseURL}/v1`,
      apiKey: env.LITELLM_API_KEY || '',
      name: 'litellm',
      fetch: litellmFetchWithThinkingDisabled,
    });
  }
  return litellmInstance;
}

function getRegoloProvider() {
  if (!regoloInstance) {
    const apiKey = env.REGOLO_API_KEY;
    if (!apiKey) {
      throw new Error('REGOLO_API_KEY is not configured');
    }
    regoloInstance = createOpenAI({
      baseURL: 'https://api.regolo.ai/v1',
      apiKey,
      name: 'regolo',
      fetch: regoloFetchWithThinkingDisabled,
    });
  }
  return regoloInstance;
}

export function isProviderConfigured(provider: string): boolean {
  let configured = false;
  switch (provider) {
    case 'mistral':
      configured = !!env.MISTRAL_API_KEY;
      console.log(
        `[providers] Checking mistral: MISTRAL_API_KEY=${configured ? 'set' : 'NOT SET'}`
      );
      return configured;
    case 'litellm': {
      const hasBaseUrl = !!env.LITELLM_BASE_URL;
      const hasApiKey = !!env.LITELLM_API_KEY;
      configured = hasBaseUrl && hasApiKey;
      console.log(
        `[providers] Checking litellm: BASE_URL=${hasBaseUrl ? 'set' : 'NOT SET'}, API_KEY=${hasApiKey ? 'set' : 'NOT SET'}`
      );
      return configured;
    }
    case 'regolo':
      configured = !!env.REGOLO_API_KEY;
      console.log(`[providers] Checking regolo: REGOLO_API_KEY=${configured ? 'set' : 'NOT SET'}`);
      return configured;
    case 'anthropic':
      return false;
    default:
      return false;
  }
}

export function getModel(provider: string, modelId: string): LanguageModel {
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
      const resolvedModel = modelId || LITELLM_DEFAULT_MODEL;
      console.log(`[providers] Creating LiteLLM model: ${resolvedModel}`);
      const litellm = getLiteLLMProvider();
      const model = litellm.chat(resolvedModel);
      console.log(`[providers] LiteLLM model created successfully`);
      return model;
    }
    case 'regolo': {
      if (!env.REGOLO_API_KEY) {
        console.log(`[providers] REGOLO_API_KEY not set, falling back to Mistral: ${modelId}`);
        const mistral = getMistralProvider();
        return mistral(modelId);
      }
      const regoloDefault = env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
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
