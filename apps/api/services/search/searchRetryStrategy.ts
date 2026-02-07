/**
 * Search Retry Strategy
 *
 * Provides retry-with-backoff and circuit breaker utilities for search services.
 * Used by both SearxngNode (WebSearchGraph) and directSearch (ChatGraph)
 * to handle transient failures gracefully.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('SearchRetry');

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  isRecoverable?: (error: Error) => boolean;
  label?: string;
}

/**
 * Classify whether an error is recoverable (worth retrying).
 * Timeouts and 5xx are recoverable; 4xx and auth errors are not.
 */
export function isRecoverableError(error: Error): boolean {
  const msg = error.message.toLowerCase();

  // Timeouts are always recoverable
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return true;
  }

  // Connection errors are recoverable (transient network issues)
  if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound')) {
    return true;
  }

  // 5xx server errors are recoverable
  if (/\b5\d{2}\b/.test(msg) || msg.includes('internal server error') || msg.includes('bad gateway') || msg.includes('service unavailable')) {
    return true;
  }

  // 4xx client errors are NOT recoverable
  if (/\b4\d{2}\b/.test(msg) || msg.includes('not found') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return false;
  }

  // Default: treat unknown errors as non-recoverable to avoid wasting time
  return false;
}

/**
 * Execute a function with retry logic.
 * Only retries on recoverable errors; immediately throws on non-recoverable ones.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, delayMs, label = 'operation' } = options;
  const checkRecoverable = options.isRecoverable ?? isRecoverableError;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries && checkRecoverable(lastError)) {
        log.warn(`[Retry] ${label} attempt ${attempt + 1} failed (recoverable): ${lastError.message}. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (!checkRecoverable(lastError)) {
        log.warn(`[Retry] ${label} failed with non-recoverable error: ${lastError.message}`);
        throw lastError;
      }
    }
  }

  log.error(`[Retry] ${label} failed after ${maxRetries + 1} attempts`);
  throw lastError!;
}

/**
 * In-memory circuit breaker for SearXNG availability.
 * Opens after `failureThreshold` consecutive failures, auto-resets after `resetTimeMs`.
 *
 * Note: Uses in-memory state (no Redis dependency) for simplicity.
 * In a multi-process setup, each worker has its own circuit state, which is acceptable
 * since SearXNG failures are typically global (the service is down for everyone).
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeMs: number;
  private readonly label: string;

  constructor(options: { failureThreshold?: number; resetTimeMs?: number; label?: string } = {}) {
    this.failureThreshold = options.failureThreshold ?? 2;
    this.resetTimeMs = options.resetTimeMs ?? 5 * 60 * 1000; // 5 minutes
    this.label = options.label ?? 'CircuitBreaker';
  }

  /**
   * Check if the circuit is currently open (service considered unavailable).
   */
  isOpen(): boolean {
    if (this.openedAt === null) return false;

    // Auto-reset after resetTimeMs (half-open → allow a retry)
    if (Date.now() - this.openedAt > this.resetTimeMs) {
      log.info(`[${this.label}] Circuit auto-reset after ${this.resetTimeMs}ms`);
      this.reset();
      return false;
    }

    return true;
  }

  /**
   * Record a successful call. Resets failure count.
   */
  recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      log.info(`[${this.label}] Success after ${this.consecutiveFailures} failures, resetting circuit`);
    }
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /**
   * Record a failed call. Opens circuit if threshold is reached.
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold && this.openedAt === null) {
      this.openedAt = Date.now();
      log.warn(`[${this.label}] Circuit OPENED after ${this.consecutiveFailures} consecutive failures`);
    }
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /**
   * Get current circuit state for observability.
   */
  getState(): { isOpen: boolean; consecutiveFailures: number; openedAt: number | null } {
    return {
      isOpen: this.isOpen(),
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
    };
  }
}

// Shared circuit breaker instance for SearXNG across the application
export const searxngCircuit = new CircuitBreaker({
  failureThreshold: 2,
  resetTimeMs: 5 * 60 * 1000,
  label: 'SearXNG',
});
