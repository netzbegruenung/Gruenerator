/**
 * Privacy mode fallback execution helper
 * Provides automatic failover across privacy-friendly LLM providers
 */

import type {
  ProviderName,
  ModelName,
  ProviderExecutor,
  PrivacyProviderData,
  ExecutionResponse,
} from './types.js';

/**
 * Check if a provider is available based on environment configuration
 */
export function isProviderAvailable(provider: ProviderName): boolean {
  switch (provider) {
    case 'ionos':
      return !!process.env.IONOS_API_TOKEN;
    case 'litellm':
      return !!process.env.LITELLM_API_KEY;
    case 'mistral':
      return !!process.env.MISTRAL_API_KEY;
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
      return 'mistral-large-2512';
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
      return 'magistral-medium-latest';
    case 'ionos':
      return 'openai/gpt-oss-120b';
    case 'litellm':
      return 'gpt-oss:120b';
    default:
      return 'mistral-large-2512';
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
  chain: ProviderName[] = ['litellm', 'mistral', 'ionos']
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
      console.log(`[SharepicFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      console.log(`[SharepicFallback ${requestId}] Trying fallback provider: ${provider}`);
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
