/**
 * Provider fallback execution helper
 * Provides automatic failover across configured LLM providers
 */

import { getDefaultModel, isProviderConfigured } from '../ai/providers.js';

import type {
  ProviderName,
  ModelName,
  ProviderExecutor,
  FallbackProviderData,
  ExecutionResponse,
} from './types.js';

/**
 * Whether a provider can be tried at all.
 *
 * Delegates rather than re-deriving from env: this file used to carry its own
 * copy that knew three of the four providers, so anything the copy had not
 * heard of reported "not configured" and was skipped — and a fifth provider
 * would inherit that silence. There is one availability rule; this is it.
 */
export function isProviderAvailable(provider: ProviderName): boolean {
  return isProviderConfigured(provider);
}

/**
 * The model to retry a failed request with on `provider`.
 *
 * Same delegation, same reason: two hand-maintained switches here (one general,
 * one for sharepics) listed the same three providers with the same three models
 * and differed only in an unreachable `default` branch. `getDefaultModel` knows
 * all four.
 */
export function getFallbackModelForProvider(provider: ProviderName): ModelName {
  return getDefaultModel(provider);
}

/**
 * Sharepic-specific fallback chain: Mistral (Magistral) → LiteLLM → Regolo
 */
export const SHAREPIC_FALLBACK_CHAIN: ProviderName[] = ['mistral', 'litellm', 'regolo'];

/**
 * The error thrown once every provider in a chain has failed.
 *
 * `cause` is the point: the last provider error is the one carrying the status
 * code, and the classifier at the `aiService` boundary walks the cause chain to
 * find it. Interpolating it into the message — as this used to — turned a
 * structured `APICallError` (429, 503, …) into prose, so a rate limit reached
 * the client as a generic `internal` error with no retry hint.
 */
function aggregateFailure(
  label: string,
  attempted: ProviderName[],
  lastError: Error | undefined
): Error {
  const msg = lastError?.message || 'Unknown error';
  return new Error(
    `All ${label} providers failed (tried: ${attempted.join(', ')}). Last error: ${msg}`,
    lastError ? { cause: lastError } : undefined
  );
}

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

  throw aggregateFailure('fallback', attemptedProviders, lastError);
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
          model: getFallbackModelForProvider(provider),
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

  throw aggregateFailure('sharepic fallback', attemptedProviders, lastError);
}
