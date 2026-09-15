/**
 * Typed 401 error shared across the raw-fetch client stacks (chat, docs) so a
 * dead session throws a recognizable error instead of `new Error('Unauthorized')`
 * or being silently swallowed into an empty list.
 *
 * The message is deliberately the exact string `'Unauthorized'`: the chat
 * runtime's unhandled-rejection suppressor matches on it, so keeping it lets
 * that safety net keep working unchanged. `status = 401` lets the web app's
 * TanStack retry predicate and `toastApiError` treat it correctly for free.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Duck-typed 401 check. NOT a bare `instanceof`: the shared package ships under
 * dual `src`/`dist` export conditions, so two module instances can coexist and
 * `instanceof` would miss the other realm's class. Match on name/status instead.
 *
 * The `status` arm also covers a raw `AxiosError` — axios copies the response
 * status onto the error in its constructor — which is how mobile's mentionable
 * sync distinguishes an anonymous 401 from a wrong path. That is an axios
 * internal, so `errors.vitest.ts` pins it against a real client rather than
 * trusting it to survive the next bump.
 */
export function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  if (err == null || typeof err !== 'object') return false;
  const e = err as { name?: unknown; status?: unknown };
  return e.name === 'UnauthorizedError' || e.status === 401;
}

/**
 * A failed HTTP response that kept its status.
 *
 * Without the status, callers cannot tell "this thread is gone" (404 — clear
 * the local reference) from "the server is having a moment" (5xx — keep the
 * reference and retry). Collapsing both into an empty result made a transient
 * outage look like deleted data.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Duck-typed status check — same dual-realm caveat as `isUnauthorizedError`.
 */
export function isApiErrorWithStatus(err: unknown, status: number): boolean {
  if (err == null || typeof err !== 'object') return false;
  return (err as { status?: unknown }).status === status;
}

/**
 * Safely read a `message` off a ts-rest error body. The client response type
 * widens the body to `unknown` for non-2xx (undeclared) statuses, so we extract
 * defensively rather than asserting the error-schema shape.
 */
export function errMessage(body: unknown, fallback = 'Aktion fehlgeschlagen.'): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

/**
 * Build an `ApiError` from a ts-rest response that came back non-2xx.
 *
 * ts-rest resolves 4xx/5xx as *data*, not a throw (`contractsClient` only
 * treats 401 as invalid), so the idiomatic `throw new Error(errMessage(body))`
 * drops the status. Three things downstream go blind at once: the TanStack
 * retry predicate retries an expected 403 instead of accepting it, the toast
 * layer cannot pick the "Zugriff verweigert" wording, and `getErrorMessage`
 * falls through to the generic fallback — which is the very condition that
 * reports the non-bug to Sentry. Keeping the status makes all three correct.
 */
export function apiErrorFromResponse(
  res: { status: number; body: unknown },
  fallback = 'Aktion fehlgeschlagen.'
): ApiError {
  return new ApiError(res.status, errMessage(res.body, fallback));
}
