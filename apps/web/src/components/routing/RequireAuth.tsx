import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthBootstrap } from '../../hooks/useAuthBootstrapped';
import { useAuthStore } from '../../stores/authStore';

import AuthSplash from './AuthSplash';

/**
 * The single auth gate for the whole app.
 *
 *   - !bootstrapped       → <AuthSplash />     (we don't know yet)
 *   - authenticated       → <Outlet />         (render the protected route)
 *   - guest (probe ok)    → /login?redirectTo=<current>
 *   - guest (probe error) → <AuthSplash />     (server unreachable — don't bounce)
 *
 * Public routes (marketing startpage, legal pages, login UI, shares) bypass
 * this guard entirely — they are mounted bare in `App.tsx`. The list of
 * public routes is `routes.filter((r) => r.public)` from `config/routes.ts`.
 *
 * Both the bootstrap signal AND `isAuthenticated` are read from the single
 * `authStatus` React Query via `useAuthBootstrap()`, not from a mirrored
 * Zustand flag — see that hook for why. `isLoggingOut` stays on the store: it
 * is a transient action-flag, not a cached truth.
 */
const RequireAuth = () => {
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const { isBootstrapped, isError, isAuthenticated } = useAuthBootstrap();
  const location = useLocation();

  // During logout the store may momentarily show authenticated from stale
  // cache before clearAuth runs. Render the outlet so the logout flow can
  // complete its own navigation to `/`.
  if (isLoggingOut) return <Outlet />;

  if (!isBootstrapped) return <AuthSplash />;

  if (!isAuthenticated) {
    // The session probe errored (server unreachable) and there's no cached
    // session to fall back on. Redirecting to `/login` is misleading — login
    // can't reach the server either, and it would strand the user with a
    // `redirectTo` they never asked for. Hold the splash; the query's
    // refetchOnReconnect / refetchOnWindowFocus recovers once the server is
    // back. A `success` answer of "guest" still falls through to the redirect.
    if (isError) return <AuthSplash />;

    const currentPath = location.pathname + location.search;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
