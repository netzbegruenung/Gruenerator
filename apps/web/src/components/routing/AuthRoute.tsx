import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

import AuthSplash from './AuthSplash';

/**
 * Guards routes that require authentication.
 *
 *   - !hasBootstrapped → <AuthSplash />  (no premature redirect to /login)
 *   - authenticated   → render Outlet
 *   - guest           → /login?redirectTo=<current>
 *
 * Splash gating matters: without it, an authenticated user with an expired
 * 15-min persist cache lands here, sees `isAuthenticated=false`, and gets
 * redirected to /login — which then GuestRoute either renders or bounces
 * once `/auth/status` confirms. The splash holds rendering until we know
 * which way to go.
 */
const AuthRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasBootstrapped = useAuthStore((s) => s.hasBootstrapped);
  const location = useLocation();

  if (!hasBootstrapped) return <AuthSplash />;

  if (!isAuthenticated) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <Outlet />;
};

export default AuthRoute;
