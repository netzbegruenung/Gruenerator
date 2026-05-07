import { useAuth as useSharedAuth } from '@gruenerator/shared/hooks';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { setSitesUnauthorizedHandler } from './lib/apiClient';

export interface SitesContextValue {
  basePath: string;
  login: (redirectTo?: string) => void;
  logout: () => void | Promise<void>;
  reportError: (error: unknown, context?: Record<string, unknown>) => void;
}

const SitesContext = createContext<SitesContextValue | null>(null);

export interface SitesProviderProps extends SitesContextValue {
  children: ReactNode;
}

export function SitesProvider({
  basePath,
  login,
  logout,
  reportError,
  children,
}: SitesProviderProps) {
  useEffect(() => {
    setSitesUnauthorizedHandler(() => {
      const here =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : undefined;
      login(here);
    });
    return () => {
      setSitesUnauthorizedHandler(null);
    };
  }, [login]);

  const value = useMemo<SitesContextValue>(
    () => ({ basePath, login, logout, reportError }),
    [basePath, login, logout, reportError]
  );

  return <SitesContext.Provider value={value}>{children}</SitesContext.Provider>;
}

function useSitesContext(): SitesContextValue {
  const ctx = useContext(SitesContext);
  if (!ctx) {
    throw new Error('useSitesContext must be used inside <SitesProvider>');
  }
  return ctx;
}

export function useSitesBasePath(): string {
  return useSitesContext().basePath;
}

export function useSitesActions(): Pick<SitesContextValue, 'login' | 'logout' | 'reportError'> {
  const { login, logout, reportError } = useSitesContext();
  return { login, logout, reportError };
}

/**
 * Combined auth + actions hook. Reads auth state from the shared store
 * (populated by the host app's auth bootstrap) and pulls login/logout from context.
 */
export function useAuth() {
  const auth = useSharedAuth();
  const { login, logout } = useSitesContext();
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    login,
    logout,
  };
}
