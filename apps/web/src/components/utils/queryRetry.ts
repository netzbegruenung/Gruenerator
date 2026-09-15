/**
 * The shared TanStack `retry` predicate.
 *
 * 401/403/404 are the server's final answer, not a hiccup — retrying one costs
 * two extra round trips and files the same expected failure three times (that
 * is GlitchTip 590: three `403`s for one page load).
 *
 * It lives in its own module rather than inline in `App.tsx` because a local
 * `retry:` override *replaces* the global default instead of narrowing it. A
 * hook that only meant "one attempt instead of two" wrote `retry: 1` and
 * silently dropped the status check along with it. Pass `maxRetries` here
 * instead of writing a bare number.
 */
const NON_RETRYABLE_STATUSES = new Set([401, 403, 404]);

export function shouldRetryQuery(failureCount: number, error: unknown, maxRetries = 2): boolean {
  // Status lives at `.status` on AxiosErrors and ApiErrors, but at
  // `.response.status` on older transformed shapes — read both.
  const err = error as { status?: number; response?: { status?: number } } | undefined;
  const status = err?.status ?? err?.response?.status;
  if (status !== undefined && NON_RETRYABLE_STATUSES.has(status)) return false;
  return failureCount < maxRetries;
}
