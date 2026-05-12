import { SitesProvider } from '@gruenerator/sites';
import { useCallback, type ReactNode } from 'react';

import useAuth from '../../hooks/useAuth';

interface SitesProviderWebProps {
  children: ReactNode;
}

export function SitesProviderWeb({ children }: SitesProviderWebProps) {
  const { logout: webLogout } = useAuth();

  const login = useCallback((redirectTo?: string) => {
    const target = redirectTo || window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(target)}`;
  }, []);

  const logout = useCallback(() => webLogout(), [webLogout]);

  const reportError = useCallback((error: unknown, context?: Record<string, unknown>) => {
    console.error('[sites]', error, context);
  }, []);

  return (
    <SitesProvider basePath="/sites" login={login} logout={logout} reportError={reportError}>
      {children}
    </SitesProvider>
  );
}

export default SitesProviderWeb;
