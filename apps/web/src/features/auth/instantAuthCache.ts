import { type UserProfile } from '@gruenerator/contracts';

import { sessionDebug } from '../../lib/sessionDebug';

import { INSTANT_AUTH_CACHE } from './storageKeys';

export interface AuthData {
  isAuthenticated: boolean;
  user?: UserProfile;
}

/**
 * Cache-first auth state loader. Returns the cached payload AND its timestamp
 * so React Query can be seeded via `initialData` + `initialDataUpdatedAt`,
 * keeping `staleTime` math correct (a 4-min-old cache stays fresh; a 6-min-old
 * cache is treated as stale and triggers a background refetch).
 */
export const getCachedAuthEntry = (): { data: AuthData; timestamp: number } | null => {
  try {
    const cached = localStorage.getItem(INSTANT_AUTH_CACHE);
    if (cached) {
      const parsed = JSON.parse(cached) as { timestamp?: number; data?: AuthData };
      if (parsed.timestamp && parsed.data) {
        const ageMs = Date.now() - parsed.timestamp;
        // `ageMs >= 0` guards the same clock-skew hole the other persisted
        // auth timestamps here already guard (`> Date.now()` → drop): after a
        // backward wall-clock jump a future-dated entry has a negative age and
        // would satisfy a bare `< 5min` check forever, seeding React Query
        // with a stale positive that never expires.
        if (ageMs >= 0 && ageMs < 5 * 60 * 1000) {
          sessionDebug('boot.cache-seed', {
            hit: true,
            ageMs,
            isAuthenticated: parsed.data.isAuthenticated,
          });
          return { data: parsed.data, timestamp: parsed.timestamp };
        }
        sessionDebug('boot.cache-rejected', { ageMs });
      }
    }
  } catch {
    // Cache read failed, return null
  }
  return null;
};
