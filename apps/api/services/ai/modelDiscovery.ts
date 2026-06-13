import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import {
  type ProviderName,
  IONOS_INCOMPATIBLE_PATTERNS,
  IONOS_BASE_URL,
  LITELLM_DEFAULT_BASE_URL,
  MISTRAL_API_URL,
  REGOLO_BASE_URL,
  isProviderConfigured,
} from './providers.js';

const log = createLogger('modelDiscovery');

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export interface PlaygroundModel {
  id: string;
  provider: ProviderName;
  name: string;
  category: string;
  reasoning: boolean;
  vision: boolean;
}

interface OpenAIModelsResponse {
  data: Array<{ id: string; object?: string; owned_by?: string }>;
}

// Mistral Medium 3.5, Gemma 4 and the gpt-oss/qwen families are all reasoning
// models with configurable thinking. `reasoning: true` here flags that; how (or
// whether) that reasoning is surfaced to the UI depends on the streaming path
// (SDK fullStream for Mistral; Regolo raw streamer for Regolo's reasoning_content).
const MODEL_METADATA: Record<string, { name: string; reasoning: boolean; vision: boolean }> = {
  'mistral-medium-2604': { name: 'Mistral Medium 3.5', reasoning: true, vision: false },
  'mistral-medium-3.5': { name: 'Mistral Medium 3.5', reasoning: true, vision: false },
  'mistral-large-2512': { name: 'Mistral Large', reasoning: false, vision: false },
  'mistral-large-latest': { name: 'Mistral Large', reasoning: false, vision: false },
  'mistral-small-latest': { name: 'Mistral Small', reasoning: false, vision: false },
  'mistral-small-2503': { name: 'Mistral Small (Vision)', reasoning: false, vision: true },
  'gemma4-31b': { name: 'Gemma 4 31B', reasoning: true, vision: true },
  // Verdigado/LiteLLM serves Gemma 4 under the 'verdigado-think' alias
  // (resolves server-side to gemma4:31b-ctx128k); the legacy bare alias
  // 'gemma' (gemma4:26b-ctx16k) is kept during rollout. Without these
  // entries, isVisionCapable would return false and the vision-override
  // would hijack every image request on the gemma-4 overflow lane to
  // Regolo, defeating alternation.
  'verdigado-think': { name: 'Gemma 4', reasoning: true, vision: true },
  gemma: { name: 'Gemma 4', reasoning: true, vision: true },
  'mistral-medium-latest': { name: 'Mistral Medium', reasoning: false, vision: false },
  'pixtral-large-latest': { name: 'Pixtral Large', reasoning: false, vision: true },
  'gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  // Verdigado/LiteLLM official alias for GPT-OSS (resolves server-side to
  // gpt-oss:120b-ctx128k); the hidden legacy alias 'gpt-oss:120b' is kept
  // below during rollout.
  'verdigado-pro': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'gpt-oss:120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'openai/gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'qwen3.5-122b': { name: 'Qwen 3.5 122B', reasoning: true, vision: true },
  'qwen3.6-27b': { name: 'Qwen 3.6 27B', reasoning: true, vision: false },
  'mistral-small-4-119b': { name: 'Mistral Small 4 119B', reasoning: true, vision: true },
  'Llama-3.3-70B-Instruct': { name: 'Llama 3.3 70B', reasoning: false, vision: false },
  'mistral-small3.2': { name: 'Mistral Small 3.2', reasoning: false, vision: false },
};

const EXCLUDE_PATTERNS = [
  /embed/i,
  /whisper/i,
  /rerank/i,
  /tts/i,
  /dall-e/i,
  /moderation/i,
  /flux/i,
  /diffusion/i,
  /codestral-mamba/i,
];

const CATEGORY_NAMES: Record<ProviderName, string> = {
  mistral: 'Mistral',
  litellm: 'LiteLLM',
  ionos: 'IONOS',
  regolo: 'Regolo',
};

const CAT_ORDER: Record<string, number> = { Mistral: 0, Regolo: 1, LiteLLM: 2, IONOS: 3 };

let cachedModels: PlaygroundModel[] | null = null;
let cacheTimestamp = 0;
let fetchInProgress: Promise<PlaygroundModel[]> | null = null;

function isExcludedModel(modelId: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => p.test(modelId));
}

function deriveDisplayName(modelId: string): string {
  return modelId
    .replace(/^openai\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function enrichModel(modelId: string, provider: ProviderName): PlaygroundModel {
  const meta = MODEL_METADATA[modelId];
  return {
    id: modelId,
    provider,
    name: meta?.name || deriveDisplayName(modelId),
    category: CATEGORY_NAMES[provider],
    reasoning: meta?.reasoning ?? false,
    vision: meta?.vision ?? false,
  };
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProviderModels(
  provider: ProviderName,
  url: string,
  apiKey: string | null
): Promise<PlaygroundModel[]> {
  if (!apiKey) {
    return [];
  }

  try {
    const response = await fetchWithTimeout(url, {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    });

    if (!response.ok) {
      log.warn(`[${provider}] API returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as OpenAIModelsResponse;
    if (!data.data || !Array.isArray(data.data)) {
      log.warn(`[${provider}] Unexpected response format`);
      return [];
    }

    const models = data.data
      .map((m) => m.id)
      .filter((id) => !isExcludedModel(id))
      .filter((id) => provider !== 'ionos' || !IONOS_INCOMPATIBLE_PATTERNS.some((p) => p.test(id)))
      .map((id) => enrichModel(id, provider));

    log.info(`[${provider}] Discovered ${models.length} models`);
    return models;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.warn(`[${provider}] Failed to fetch models: ${msg}`);
    return [];
  }
}

const PROVIDER_ENDPOINTS: Record<
  ProviderName,
  { url: () => string; getApiKey: () => string | null }
> = {
  mistral: {
    url: () => `${MISTRAL_API_URL}/models`,
    getApiKey: () => env.MISTRAL_API_KEY ?? null,
  },
  litellm: {
    url: () => {
      const base = env.LITELLM_BASE_URL || LITELLM_DEFAULT_BASE_URL;
      return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
    },
    getApiKey: () => env.LITELLM_API_KEY ?? null,
  },
  ionos: {
    url: () => `${IONOS_BASE_URL}/models`,
    getApiKey: () => env.IONOS_API_TOKEN ?? null,
  },
  regolo: {
    url: () => `${REGOLO_BASE_URL}/models`,
    getApiKey: () => env.REGOLO_API_KEY ?? null,
  },
};

function fetchModelsForProvider(provider: ProviderName): Promise<PlaygroundModel[]> {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  return fetchProviderModels(provider, endpoint.url(), endpoint.getApiKey());
}

const FALLBACK_MODELS: PlaygroundModel[] = ['mistral-medium-2604', 'mistral-small-latest']
  .map((id) => enrichModel(id, 'mistral'))
  .concat(
    [
      'qwen3.5-122b',
      'mistral-small-4-119b',
      'Llama-3.3-70B-Instruct',
      'gpt-oss-120b',
      'mistral-small3.2',
    ].map((id) => enrichModel(id, 'regolo')),
    [enrichModel('verdigado-pro', 'litellm')],
    [enrichModel('openai/gpt-oss-120b', 'ionos')]
  );

async function discoverModels(): Promise<PlaygroundModel[]> {
  const providers: ProviderName[] = ['mistral', 'litellm', 'ionos', 'regolo'];
  const results = await Promise.allSettled(
    providers.filter((p) => isProviderConfigured(p)).map((p) => fetchModelsForProvider(p))
  );

  const allModels: PlaygroundModel[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allModels.push(...result.value);
    }
  }

  if (allModels.length === 0) {
    log.warn('All provider APIs failed, using fallback models');
    return FALLBACK_MODELS;
  }

  allModels.sort((a, b) => {
    const catDiff = (CAT_ORDER[a.category] ?? 99) - (CAT_ORDER[b.category] ?? 99);
    return catDiff !== 0 ? catDiff : a.name.localeCompare(b.name);
  });

  return allModels;
}

export async function getAvailableModels(forceRefresh = false): Promise<PlaygroundModel[]> {
  if (!forceRefresh && cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  if (fetchInProgress) {
    return fetchInProgress;
  }

  fetchInProgress = discoverModels()
    .then((models) => {
      cachedModels = models;
      cacheTimestamp = Date.now();
      log.info(`Model cache refreshed: ${models.length} models`);
      return models;
    })
    .catch((error) => {
      log.error('Model discovery failed:', error);
      return cachedModels ?? FALLBACK_MODELS;
    })
    .finally(() => {
      fetchInProgress = null;
    });

  return fetchInProgress;
}

/**
 * Check if a model ID is known to support vision.
 * Uses MODEL_METADATA (synchronous, no API call needed).
 */
export function isVisionCapable(modelId: string): boolean {
  const meta = MODEL_METADATA[modelId];
  return meta?.vision ?? false;
}

/**
 * Check if a model ID is a reasoning/thinking model.
 * Uses MODEL_METADATA (synchronous, no API call needed). Drives request-level
 * reasoning enablement (e.g. Mistral `reasoningEffort`).
 */
export function isReasoningCapable(modelId: string): boolean {
  const meta = MODEL_METADATA[modelId];
  return meta?.reasoning ?? false;
}

/**
 * Get all vision-capable models from the cached discovery results.
 * Falls back to MODEL_METADATA if cache is empty.
 */
export async function getVisionCapableModels(): Promise<PlaygroundModel[]> {
  const allModels = await getAvailableModels();
  return allModels.filter((m) => m.vision);
}
