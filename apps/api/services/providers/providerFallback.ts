/**
 * Provider fallback execution helper
 * Provides automatic failover across configured LLM providers
 */

import { env } from '../../config/env.js';

import type {
  ProviderName,
  ModelName,
  ProviderExecutor,
  FallbackProviderData,
  ExecutionResponse,
} from './types.js';

/**
 * Check if a provider is available based on environment configuration
 */
export function isProviderAvailable(provider: ProviderName): boolean {
  switch (provider) {
    case 'litellm':
      return !!env.LITELLM_API_KEY;
    case 'mistral':
      return !!env.MISTRAL_API_KEY;
    case 'regolo':
      return !!env.REGOLO_API_KEY;
    default:
      return false;
  }
}

/**
 * Get the appropriate model for a fallback provider
 */
export function getFallbackModelForProvider(provider: ProviderName): ModelName {
  switch (provider) {
    case 'litellm':
      return 'verdigado-pro';
    case 'mistral':
      return 'mistral-medium-2604';
    case 'regolo':
      return env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
    default:
      return 'verdigado-pro';
  }
}

/**
 * Get the appropriate model for sharepic fallback
 */
export function getSharepicFallbackModel(provider: ProviderName): ModelName {
  switch (provider) {
    case 'mistral':
      return 'mistral-medium-2604';
    case 'litellm':
      return 'verdigado-pro';
    case 'regolo':
      return env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
    default:
      return 'mistral-medium-2604';
  }
}

/**
 * Sharepic-specific fallback chain: Mistral (Magistral) → LiteLLM → Regolo
 */
export const SHAREPIC_FALLBACK_CHAIN: ProviderName[] = ['mistral', 'litellm', 'regolo'];

/**
 * Try fallback providers in order, using a caller-supplied executor.
 * Only attempts providers that have the required API tokens configured.
 *
 * @param execForProvider - Async function that executes the request for a given provider
 * @param requestId - Request ID for logging
 * @param data - Request data to be passed to executor
 * @param chain - Provider chain to try in order (default: LiteLLM → Regolo → Mistral)
 * @throws {Error} When no providers are configured or all providers fail
 * @returns The successful response from the first working provider
 */
export async function tryFallbackProviders(
  execForProvider: ProviderExecutor,
  requestId: string,
  data: FallbackProviderData,
  chain: ProviderName[] = ['litellm', 'regolo', 'mistral']
): Promise<ExecutionResponse> {
  let lastError: Error | undefined;
  const attemptedProviders: ProviderName[] = [];

  for (const provider of chain) {
    // Skip providers that are not configured
    if (!isProviderAvailable(provider)) {
      console.log(`[ProviderFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      console.log(`[ProviderFallback ${requestId}] Trying fallback provider: ${provider}`);
      const fallbackData: FallbackProviderData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: getFallbackModelForProvider(provider),
        },
      };
      const result = await execForProvider(provider, fallbackData);

      // Validate the response has content
      if (result?.content || result?.stop_reason === 'tool_use') {
        console.log(`[ProviderFallback ${requestId}] Success with provider: ${provider}`);
        return result;
      }

      // Empty response, try next provider
      console.warn(`[ProviderFallback ${requestId}] Empty response from ${provider}, trying next`);
      lastError = new Error(`Empty response from ${provider}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[ProviderFallback ${requestId}] Error from ${provider}: ${errorMessage}`);
      lastError = err instanceof Error ? err : new Error(errorMessage);
      continue;
    }
  }

  if (attemptedProviders.length === 0) {
    throw new Error(
      'No fallback providers are configured. Please set LITELLM_API_KEY, MISTRAL_API_KEY, or REGOLO_API_KEY'
    );
  }

  const msg = lastError?.message || 'Unknown error';
  throw new Error(
    `All fallback providers failed (tried: ${attemptedProviders.join(', ')}). Last error: ${msg}`
  );
}

/**
 * Sharepic-specific fallback with higher quality models.
 * Uses Magistral → LiteLLM → Regolo chain.
 */
export async function trySharepicFallbackProviders(
  execForProvider: ProviderExecutor,
  requestId: string,
  data: FallbackProviderData
): Promise<ExecutionResponse> {
  let lastError: Error | undefined;
  const attemptedProviders: ProviderName[] = [];

  for (const provider of SHAREPIC_FALLBACK_CHAIN) {
    if (!isProviderAvailable(provider)) {
      console.log(`[SharepicFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      console.log(`[SharepicFallback ${requestId}] Trying fallback provider: ${provider}`);
      const fallbackData: FallbackProviderData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: getSharepicFallbackModel(provider),
        },
      };
      const result = await execForProvider(provider, fallbackData);

      if (result?.content || result?.stop_reason === 'tool_use') {
        console.log(`[SharepicFallback ${requestId}] Success with provider: ${provider}`);
        return result;
      }

      console.warn(`[SharepicFallback ${requestId}] Empty response from ${provider}, trying next`);
      lastError = new Error(`Empty response from ${provider}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[SharepicFallback ${requestId}] Error from ${provider}: ${errorMessage}`);
      lastError = err instanceof Error ? err : new Error(errorMessage);
      continue;
    }
  }

  if (attemptedProviders.length === 0) {
    throw new Error('No sharepic fallback providers are configured');
  }

  const msg = lastError?.message || 'Unknown error';
  throw new Error(
    `All sharepic fallback providers failed (tried: ${attemptedProviders.join(', ')}). Last error: ${msg}`
  );
}
