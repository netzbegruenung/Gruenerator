import { Navigate } from 'react-router-dom';

import { useAuthBootstrapped } from '../../hooks/useAuthBootstrapped';
import { useAuthStore } from '../../stores/authStore';

import AuthSplash from './AuthSplash';

interface HomeRedirectProps {
  children: React.ReactNode;
}

/**
 * Special-cases the marketing startpage (`/`): authenticated users are sent
 * to `/workplace`, guests see the Startseite. This is the *only* route with
 * guest-only semantics — every other public route renders the same for both
 * audiences (legal pages, public shares, the login UI itself).
 *
 * Splits responsibility cleanly: `RequireAuth` is "are you logged in or not,"
 * `HomeRedirect` is "where should logged-in users actually be." Keeps the
 * guard simple and the special case visible at the call site in App.tsx.
 */
const HomeRedirect = ({ children }: HomeRedirectProps) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const isBootstrapped = useAuthBootstrapped();

  if (isLoggingOut) return <>{children}</>;
  if (!isBootstrapped) return <AuthSplash />;
  if (isAuthenticated) return <Navigate to="/workplace" replace />;
  return <>{children}</>;
};

export default HomeRedirect;
