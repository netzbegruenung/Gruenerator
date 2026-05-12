import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

import AuthSplash from './AuthSplash';

/**
 * Guards "guest only" routes like /, /login, /register.
 *
 * Three-state truth table:
 *   - !hasBootstrapped              → <AuthSplash />  (we don't know yet)
 *   - guest (no server confirmation) → render Outlet  (show Startseite/login)
 *   - authenticated & server-confirmed → /workplace
 *
 * Two failure modes this defends against:
 *   1. Stale `isAuthenticated: true` from the 15-min persist cache surviving
 *      a backend session expiry — `hasServerConfirmed` gates the redirect so
 *      we don't bounce a real guest off /login.
 *   2. Stale `isAuthenticated: false` from an expired persist cache while
 *      the Keycloak cookie is still valid — `hasBootstrapped` suspends
 *      rendering so we don't flash Startseite at an authenticated user.
 */
const GuestRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasServerConfirmed = useAuthStore((s) => s.hasServerConfirmed);
  const hasBootstrapped = useAuthStore((s) => s.hasBootstrapped);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  // Don't redirect during logout — store may momentarily show authenticated from stale cache
  if (isLoggingOut) return <Outlet />;

  if (!hasBootstrapped) return <AuthSplash />;

  return isAuthenticated && hasServerConfirmed ? (
    <Navigate to="/workplace" replace />
  ) : (
    <Outlet />
  );
};

export default GuestRoute;
