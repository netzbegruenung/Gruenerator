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

const MODEL_METADATA: Record<string, { name: string; reasoning: boolean; vision: boolean }> = {
  'mistral-large-2512': { name: 'Mistral Large', reasoning: false, vision: false },
  'mistral-large-latest': { name: 'Mistral Large', reasoning: false, vision: false },
  'magistral-medium-latest': { name: 'Magistral Medium', reasoning: true, vision: false },
  'magistral-small-latest': { name: 'Magistral Small', reasoning: true, vision: false },
  'mistral-small-latest': { name: 'Mistral Small', reasoning: false, vision: false },
  'mistral-small-2503': { name: 'Mistral Small (Vision)', reasoning: false, vision: true },
  'qwen3-vl-32b': { name: 'Qwen3 VL 32B', reasoning: false, vision: true },
  'mistral-medium-latest': { name: 'Mistral Medium', reasoning: false, vision: false },
  'pixtral-large-latest': { name: 'Pixtral Large', reasoning: false, vision: true },
  'gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'gpt-oss:120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'openai/gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'qwen3.5-122b': { name: 'Qwen 3.5 122B', reasoning: true, vision: false },
  'mistral-small-4-119b': { name: 'Mistral Small 4 119B', reasoning: true, vision: false },
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

const PROVIDER_ENDPOINTS: Record<ProviderName, { url: () => string; envKey: string }> = {
  mistral: { url: () => `${MISTRAL_API_URL}/models`, envKey: 'MISTRAL_API_KEY' },
  litellm: {
    url: () => {
      const base = process.env.LITELLM_BASE_URL || LITELLM_DEFAULT_BASE_URL;
      return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
    },
    envKey: 'LITELLM_API_KEY',
  },
  ionos: { url: () => `${IONOS_BASE_URL}/models`, envKey: 'IONOS_API_TOKEN' },
  regolo: { url: () => `${REGOLO_BASE_URL}/models`, envKey: 'REGOLO_API_KEY' },
};

function fetchModelsForProvider(provider: ProviderName): Promise<PlaygroundModel[]> {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  return fetchProviderModels(provider, endpoint.url(), process.env[endpoint.envKey] || null);
}

const FALLBACK_MODELS: PlaygroundModel[] = [
  'mistral-large-2512',
  'magistral-medium-latest',
  'mistral-small-latest',
]
  .map((id) => enrichModel(id, 'mistral'))
  .concat(
    [
      'qwen3.5-122b',
      'mistral-small-4-119b',
      'Llama-3.3-70B-Instruct',
      'gpt-oss-120b',
      'mistral-small3.2',
    ].map((id) => enrichModel(id, 'regolo')),
    [enrichModel('gpt-oss:120b', 'litellm')],
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
 * Get all vision-capable models from the cached discovery results.
 * Falls back to MODEL_METADATA if cache is empty.
 */
export async function getVisionCapableModels(): Promise<PlaygroundModel[]> {
  const allModels = await getAvailableModels();
  return allModels.filter((m) => m.vision);
}
