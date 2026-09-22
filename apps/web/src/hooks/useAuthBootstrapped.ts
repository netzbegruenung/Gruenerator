import { hashKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

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
 * Read-only means reading the query cache, not a second `useQuery`. An
 * observer without `queryFn` logs a missing-`queryFn` error on every render
 * (#3500), and its options overwrite the shared query's, wiping the active
 * observer's `queryFn` and `meta: { silent: true }`. `skipToken` would silence
 * the log but leave a skip token on the query for option-less refetches. The
 * cache is populated by `AuthBootstrap`'s active query (or its `initialData`).
 */
const AUTH_STATUS_HASH = hashKey(['authStatus']);

export const useAuthBootstrap = (): {
  isBootstrapped: boolean;
  isError: boolean;
  isAuthenticated: boolean;
} => {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
  const state = useSyncExternalStore(
    subscribe,
    () => cache.get<AuthData>(AUTH_STATUS_HASH)?.state ?? null
  );
  const status = state?.status ?? 'pending';
  const data = state?.data;
  return {
    isBootstrapped: status !== 'pending',
    isError: status === 'error',
    isAuthenticated: data?.isAuthenticated === true,
  };
};
