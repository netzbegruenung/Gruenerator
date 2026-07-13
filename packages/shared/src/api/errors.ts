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
 */
export function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  if (err == null || typeof err !== 'object') return false;
  const e = err as { name?: unknown; status?: unknown };
  return e.name === 'UnauthorizedError' || e.status === 401;
}
