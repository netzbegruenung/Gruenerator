import { type ComponentType } from 'react';

import NotFound from '../components/pages/NotFound';
import { useAuthStore } from '../stores/authStore';

/**
 * The one web gate for Parteitage: tile, search entry and routes are visible
 * only to instance admins. admin only until the system-media volume is live
 * (Salt #5527). Remove this file and its uses (routes.ts, CanvasLandingPage,
 * featureIndex) to open the feature up.
 */
export const PARTEITAGE_TOOL_ID = 'parteitage';
export const PARTEITAGE_PATH_PREFIX = '/parteitage';

export const isParteitagePath = (path: string): boolean =>
  path === PARTEITAGE_PATH_PREFIX || path.startsWith(`${PARTEITAGE_PATH_PREFIX}/`);

export const useCanSeeParteitage = (): boolean => useAuthStore((s) => s.user?.is_admin === true);

/** Wraps a Parteitage page: non-admins get the normal not-found page. */
export function withParteitageAdminGate<P extends object>(Page: ComponentType<P>) {
  const Gated = (props: P) => {
    const allowed = useCanSeeParteitage();
    return allowed ? <Page {...props} /> : <NotFound />;
  };
  return Gated;
}
