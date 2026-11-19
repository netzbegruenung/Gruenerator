import { type ComponentType } from 'react';

import NotFound from '../components/pages/NotFound';
import { useAuthStore } from '../stores/authStore';

/**
 * Web visibility gate for Sites. Authority stays on the server
 * (`requireSitesAccess`, `sitesEntitlement.ts`); this only hides entry points.
 * Strict `=== true`: a missing field on a stale persisted user means "no".
 */
export const SITES_PATH_PREFIX = '/sites';

export const isSitesPath = (path: string): boolean =>
  path === SITES_PATH_PREFIX || path.startsWith(`${SITES_PATH_PREFIX}/`);

export const useCanSeeSites = (): boolean => useAuthStore((s) => s.user?.sites_unlocked === true);

/** Wraps a Sites page: non-entitled accounts get the normal not-found page. */
export function withSitesGate<P extends object>(Page: ComponentType<P>) {
  const Gated = (props: P) => {
    const allowed = useCanSeeSites();
    return allowed ? <Page {...props} /> : <NotFound />;
  };
  return Gated;
}
