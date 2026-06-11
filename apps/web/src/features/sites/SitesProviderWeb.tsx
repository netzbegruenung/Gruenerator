import { SitesProvider, type SitesAuth } from '@gruenerator/sites';
import { useCallback, useMemo, type ReactNode } from 'react';

import ErrorBoundary from '../../components/ErrorBoundary';
import useAuth from '../../hooks/useAuth';

interface SitesProviderWebProps {
  children: ReactNode;
}

export function SitesProviderWeb({ children }: SitesProviderWebProps) {
  const { user, isAuthenticated, loading, error, logout: webLogout } = useAuth();

  const login = useCallback((redirectTo?: string) => {
    const target = redirectTo || window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(target)}`;
  }, []);

  const logout = useCallback(() => webLogout(), [webLogout]);

  const reportError = useCallback((error: unknown, context?: Record<string, unknown>) => {
    console.error('[sites]', error, context);
  }, []);

  // Feed Sites its auth state from the web's React-Query-backed truth. Sites
  // used to read the shared Zustand store, which the web app never populates —
  // that left `isLoading` stuck `true` and the page hung on its spinner.
  const auth = useMemo<SitesAuth>(
    () => ({
      user: user ? { id: user.id, email: user.email, display_name: user.display_name } : null,
      isAuthenticated,
      isLoading: loading,
      error,
    }),
    [user, isAuthenticated, loading, error]
  );

  return (
    <ErrorBoundary>
      <SitesProvider
        basePath="/sites"
        auth={auth}
        login={login}
        logout={logout}
        reportError={reportError}
      >
        {children}
      </SitesProvider>
    </ErrorBoundary>
  );
}

export default SitesProviderWeb;
