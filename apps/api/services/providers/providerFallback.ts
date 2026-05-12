/**
 * Privacy mode fallback execution helper
 * Provides automatic failover across privacy-friendly LLM providers
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import type {
  ProviderName,
  ModelName,
  ProviderExecutor,
  PrivacyProviderData,
  ExecutionResponse,
} from './types.js';

const log = createLogger('providerFallback');

/**
 * Check if a provider is available based on environment configuration
 */
export function isProviderAvailable(provider: ProviderName): boolean {
  switch (provider) {
    case 'ionos':
      return !!env.IONOS_API_TOKEN;
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
 * Get the appropriate model for a privacy fallback provider
 */
export function getPrivacyModelForProvider(provider: ProviderName): ModelName {
  switch (provider) {
    case 'ionos':
      return 'openai/gpt-oss-120b';
    case 'litellm':
      return 'gpt-oss:120b';
    case 'mistral':
      return 'mistral-medium-2604';
    case 'regolo':
      return env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
    default:
      return 'gpt-oss:120b';
  }
}

/**
 * Get the appropriate model for sharepic fallback
 */
export function getSharepicFallbackModel(provider: ProviderName): ModelName {
  switch (provider) {
    case 'mistral':
      return 'mistral-medium-2604';
    case 'ionos':
      return 'openai/gpt-oss-120b';
    case 'litellm':
      return 'gpt-oss:120b';
    case 'regolo':
      return env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
    default:
      return 'mistral-medium-2604';
  }
}

/**
 * Sharepic-specific fallback chain: Mistral (Magistral) → IONOS → LiteLLM
 */
export const SHAREPIC_FALLBACK_CHAIN: ProviderName[] = ['mistral', 'ionos', 'litellm'];

/**
 * Try privacy-friendly providers in order, using a caller-supplied executor.
 * Only attempts providers that have the required API tokens configured.
 *
 * @param execForProvider - Async function that executes the request for a given provider
 * @param requestId - Request ID for logging
 * @param data - Request data to be passed to executor
 * @param chain - Provider chain to try in order (default: LiteLLM → Mistral → IONOS)
 * @throws {Error} When no providers are configured or all providers fail
 * @returns The successful response from the first working provider
 */
export async function tryPrivacyModeProviders(
  execForProvider: ProviderExecutor,
  requestId: string,
  data: PrivacyProviderData,
  chain: ProviderName[] = ['litellm', 'regolo', 'mistral', 'ionos']
): Promise<ExecutionResponse> {
  let lastError: Error | undefined;
  const attemptedProviders: ProviderName[] = [];

  for (const provider of chain) {
    // Skip providers that are not configured
    if (!isProviderAvailable(provider)) {
      log.debug(`[ProviderFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      log.debug(`[ProviderFallback ${requestId}] Trying fallback provider: ${provider}`);
      const privacyData: PrivacyProviderData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: getPrivacyModelForProvider(provider),
        },
      };
      const result = await execForProvider(provider, privacyData);

      // Validate the response has content
      if (result?.content || result?.stop_reason === 'tool_use') {
        log.debug(`[ProviderFallback ${requestId}] Success with provider: ${provider}`);
        return result;
      }

      // Empty response, try next provider
      log.warn(`[ProviderFallback ${requestId}] Empty response from ${provider}, trying next`);
      lastError = new Error(`Empty response from ${provider}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn(`[ProviderFallback ${requestId}] Error from ${provider}: ${errorMessage}`);
      lastError = err instanceof Error ? err : new Error(errorMessage);
      continue;
    }
  }

  if (attemptedProviders.length === 0) {
    throw new Error(
      'No privacy mode providers are configured. Please set LITELLM_API_KEY, MISTRAL_API_KEY, or IONOS_API_TOKEN'
    );
  }

  const msg = lastError?.message || 'Unknown error';
  throw new Error(
    `All privacy mode providers failed (tried: ${attemptedProviders.join(', ')}). Last error: ${msg}`
  );
}

/**
 * Sharepic-specific fallback with higher quality models.
 * Uses Magistral → IONOS → LiteLLM chain.
 */
export async function trySharepicFallbackProviders(
  execForProvider: ProviderExecutor,
  requestId: string,
  data: PrivacyProviderData
): Promise<ExecutionResponse> {
  let lastError: Error | undefined;
  const attemptedProviders: ProviderName[] = [];

  for (const provider of SHAREPIC_FALLBACK_CHAIN) {
    if (!isProviderAvailable(provider)) {
      log.debug(`[SharepicFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      log.debug(`[SharepicFallback ${requestId}] Trying fallback provider: ${provider}`);
      const fallbackData: PrivacyProviderData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: getSharepicFallbackModel(provider),
        },
      };
      const result = await execForProvider(provider, fallbackData);

      if (result?.content || result?.stop_reason === 'tool_use') {
        log.debug(`[SharepicFallback ${requestId}] Success with provider: ${provider}`);
        return result;
      }

      log.warn(`[SharepicFallback ${requestId}] Empty response from ${provider}, trying next`);
      lastError = new Error(`Empty response from ${provider}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn(`[SharepicFallback ${requestId}] Error from ${provider}: ${errorMessage}`);
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
