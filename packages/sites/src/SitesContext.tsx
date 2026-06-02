import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { setSitesUnauthorizedHandler } from './lib/apiClient';

/**
 * Minimal user shape Sites consumes. Satisfied by each host's own user object
 * (web `UserProfile`, mobile shared `User`) — Sites only ever reads `email`
 * and `display_name`, so it intentionally does not depend on either heavy type
 * (which disagree on whether `email` is required).
 */
export interface SitesUser {
  id: string;
  email?: string;
  display_name?: string;
}

export interface SitesAuth {
  user: SitesUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface SitesContextValue {
  basePath: string;
  auth: SitesAuth;
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
  auth,
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
    () => ({ basePath, auth, login, logout, reportError }),
    [basePath, auth, login, logout, reportError]
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
 * Combined auth + actions hook. Auth state is injected by the host app via
 * `<SitesProvider auth=...>` — the web host sources it from its React-Query
 * `authStatus` truth, mobile from the shared store. Sites must NOT read a
 * global auth store directly: the web app keeps its own store and never
 * populates the shared one, so reading it pinned `isLoading: true` forever.
 */
export function useAuth() {
  const { auth, login, logout } = useSitesContext();
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    login,
    logout,
  };
}
