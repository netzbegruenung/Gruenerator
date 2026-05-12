import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

/**
 * Guards "guest only" routes like /login.
 *
 * Redirects away to /workplace ONLY when the server has confirmed the user
 * is authenticated in the current page load (`hasServerConfirmed: true`).
 * A merely cached/persisted `isAuthenticated: true` is not enough — the
 * Zustand persist layer and the instant-auth cache can both keep that flag
 * alive across a backend session expiry, which used to bounce the user
 * /login ↔ /workplace until the cache aged out. See storageKeys.ts and
 * authStore.ts hasServerConfirmed for the broader contract.
 */
const GuestRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasServerConfirmed = useAuthStore((s) => s.hasServerConfirmed);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  // Don't redirect during logout — store may momentarily show authenticated from stale cache
  if (isLoggingOut) return <Outlet />;

  return isAuthenticated && hasServerConfirmed ? (
    <Navigate to="/workplace" replace />
  ) : (
    <Outlet />
  );
};

export default GuestRoute;
