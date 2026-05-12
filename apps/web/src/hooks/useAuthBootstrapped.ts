import { useQuery } from '@tanstack/react-query';

/**
 * Returns `true` once the canonical `authStatus` query has answered at least
 * once this page load — whether the answer was "authenticated" or "guest".
 * Returns `false` only while the query is still pending its first resolution.
 *
 * Why this exists as its own hook instead of a Zustand flag: the source of
 * truth for "have we asked the server yet?" already lives in the React Query
 * cache. Mirroring it into a Zustand store via `useEffect` was the pattern
 * that hid the cold-start splash hang in PR #782 — guards inside the mirror
 * forgot to flip the bit on the "already-guest" branch. Reading the query
 * status directly removes the mirror, removes the guards, removes the bug.
 *
 * `enabled: false` makes this consumer read-only. It subscribes to the cache
 * populated by `AuthBootstrap`'s active fetch (or by React Query's
 * `initialData` from the instant-auth cache). React Query dedupes by
 * `queryKey`, so both subscribers see the same status.
 */
export const useAuthBootstrapped = (): boolean => {
  const { status } = useQuery({ queryKey: ['authStatus'], enabled: false });
  return status !== 'pending';
};
