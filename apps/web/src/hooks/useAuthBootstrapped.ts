import { useQuery } from '@tanstack/react-query';

import { type AuthData } from './useAuth';

/**
 * Read-only subscription to the canonical `authStatus` query — the single
 * source of truth for the app's auth gate. Returns three derived signals:
 *
 *   - `isBootstrapped` — `true` once the query has answered at least once this
 *     page load (whether "authenticated", "guest", or "errored"); `false` only
 *     while still pending its first resolution. With `initialData` from the
 *     instant-auth cache the query resolves synchronously on the warm path, so
 *     the splash never flashes.
 *   - `isError` — the probe errored (server unreachable / transient failure)
 *     rather than answering. `RequireAuth` uses this so an errored probe with
 *     no cached session holds the splash instead of bouncing to `/login` —
 *     login can't reach the server either. A `success` answer of "guest" still
 *     redirects.
 *   - `isAuthenticated` — derived from the query's `data`, NOT a mirrored
 *     Zustand flag. Sourcing both "have we resolved?" and "are we authed?" from
 *     the *same* query is what removes the two-clock desync: a stale Zustand
 *     cache and a fresh React Query state could otherwise disagree
 *     mid-navigation and bounce a logged-in user to `/login`.
 *
 * Why read the query directly instead of a Zustand mirror: mirroring "have we
 * asked the server yet?" into a store via `useEffect` was the pattern that hid
 * the cold-start splash hang in PR #782 — guards inside the mirror forgot to
 * flip the bit on the "already-guest" branch. Reading the query status removes
 * the mirror, the guards, and the bug.
 *
 * `enabled: false` makes this consumer read-only — it subscribes to the cache
 * populated by `AuthBootstrap`'s active fetch (or by `initialData`). React
 * Query dedupes by `queryKey`, so every subscriber sees the same state.
 */
export const useAuthBootstrap = (): {
  isBootstrapped: boolean;
  isError: boolean;
  isAuthenticated: boolean;
} => {
  const { status, data } = useQuery<AuthData>({ queryKey: ['authStatus'], enabled: false });
  return {
    isBootstrapped: status !== 'pending',
    isError: status === 'error',
    isAuthenticated: data?.isAuthenticated === true,
  };
};
