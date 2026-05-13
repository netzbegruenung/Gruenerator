import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthBootstrapped } from '../../hooks/useAuthBootstrapped';
import { useAuthStore } from '../../stores/authStore';

import AuthSplash from './AuthSplash';

/**
 * The single auth gate for the whole app.
 *
 *   - !bootstrapped     → <AuthSplash />     (we don't know yet)
 *   - authenticated     → <Outlet />         (render the protected route)
 *   - guest             → /login?redirectTo=<current>
 *
 * Public routes (marketing startpage, legal pages, login UI, shares) bypass
 * this guard entirely — they are mounted bare in `App.tsx`. The list of
 * public routes is `routes.filter((r) => r.public)` from `config/routes.ts`.
 *
 * Bootstrap state is read from React Query via `useAuthBootstrapped()`, not
 * from a mirrored Zustand flag — see that hook for why.
 */
const RequireAuth = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const isBootstrapped = useAuthBootstrapped();
  const location = useLocation();

  // During logout the store may momentarily show authenticated from stale
  // cache before clearAuth runs. Render the outlet so the logout flow can
  // complete its own navigation to `/`.
  if (isLoggingOut) return <Outlet />;

  if (!isBootstrapped) return <AuthSplash />;

  if (!isAuthenticated) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
