/**
 * Structured classification of AI-provider failures, so the route layer can
 * branch on retryable vs not, rate-limit vs invalid request — see the taxonomy
 * `sseHelpers` emits.
 *
 * This existed because errors crossing the `worker_threads` boundary lost their
 * class and status (only strings survive `postMessage`): the worker classified
 * before posting, the pool rebuilt an `AiProviderError`. There is no boundary to
 * cross any more, so classification happens once, at the outer edge of
 * `services/ai/aiService.ts`. Everything below it throws raw.
 */

import { APICallError } from 'ai';

export type ProviderErrorCode =
  'rate_limited' | 'provider_unavailable' | 'timeout' | 'invalid_request' | 'unknown';

export interface ProviderErrorInfo {
  code: ProviderErrorCode;
  retryable: boolean;
  statusCode?: number;
}

const NETWORK_ERROR_PATTERN =
  /fetch failed|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|network/i;

function extractStatusCode(error: unknown, depth = 0): number | null {
  if (depth > 4 || typeof error !== 'object' || error === null) return null;
  const candidate = error as { statusCode?: unknown; status?: unknown; cause?: unknown };
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  if (typeof candidate.status === 'number') return candidate.status;
  if (candidate.cause) return extractStatusCode(candidate.cause, depth + 1);
  return null;
}

function causeChainMessages(error: unknown, depth = 0): string {
  if (depth > 4 || !(error instanceof Error)) return '';
  const causeCode =
    typeof (error.cause as { code?: unknown } | undefined)?.code === 'string'
      ? String((error.cause as { code: string }).code)
      : '';
  return `${error.message} ${causeCode} ${causeChainMessages(error.cause, depth + 1)}`;
}

export function classifyProviderError(error: unknown): ProviderErrorInfo {
  // The AI SDK's own classification is authoritative where available.
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode;
    if (statusCode === 429) return { code: 'rate_limited', retryable: true, statusCode };
    if (statusCode === 408) return { code: 'timeout', retryable: true, statusCode };
    if (statusCode != null && statusCode >= 500) {
      return { code: 'provider_unavailable', retryable: true, statusCode };
    }
    if (statusCode != null && statusCode >= 400) {
      return { code: 'invalid_request', retryable: false, statusCode };
    }
    return {
      code: error.isRetryable ? 'provider_unavailable' : 'unknown',
      retryable: error.isRetryable,
      ...(statusCode != null && { statusCode }),
    };
  }

  const statusCode = extractStatusCode(error);
  const name = error instanceof Error ? error.name : '';
  const text = error instanceof Error ? causeChainMessages(error) : String(error ?? '');

  if (name === 'AbortError' || name === 'TimeoutError') {
    return { code: 'timeout', retryable: true, ...(statusCode != null && { statusCode }) };
  }

  if (statusCode != null) {
    if (statusCode === 429) return { code: 'rate_limited', retryable: true, statusCode };
    if (statusCode === 408) return { code: 'timeout', retryable: true, statusCode };
    if (statusCode >= 500) return { code: 'provider_unavailable', retryable: true, statusCode };
    if (statusCode >= 400) return { code: 'invalid_request', retryable: false, statusCode };
  }

  if (NETWORK_ERROR_PATTERN.test(text)) {
    return { code: 'provider_unavailable', retryable: true };
  }
  if (/rate.?limit/i.test(text)) {
    return { code: 'rate_limited', retryable: true };
  }
  if (/timeout|timed out/i.test(text)) {
    return { code: 'timeout', retryable: true };
  }

  return { code: 'unknown', retryable: false };
}

/**
 * Typed provider failure. Downstream consumers (retry layers, SSE error
 * emitters) branch on `code`/`retryable` instead of parsing message strings.
 *
 * Constructed at exactly one place — the boundary in `services/ai/aiService.ts`.
 * Keep `cause` populated: the original error is what carries the status code,
 * and callers that log it want the real stack, not this wrapper's.
 */
export class AiProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, info: ProviderErrorInfo, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiProviderError';
    this.code = info.code;
    this.retryable = info.retryable;
    if (info.statusCode != null) this.statusCode = info.statusCode;
  }
}
