import { type CollaborationConfig } from '@gruenerator/collab';
import { type SupportedLocale } from '@gruenerator/contracts';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Minimal user shape Sites consumes. Satisfied by each host's own user object
 * (web `UserProfile`, mobile shared `User`) — Sites only ever reads `email`,
 * `display_name` and `locale`, so it intentionally does not depend on either heavy type
 * (which disagree on whether `email` is required).
 */
export interface SitesUser {
  id: string;
  email?: string;
  display_name?: string;
  locale: SupportedLocale;
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
  collaboration: CollaborationConfig;
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
  collaboration,
  children,
}: SitesProviderProps) {
  const value = useMemo<SitesContextValue>(
    () => ({ basePath, auth, login, logout, reportError, collaboration }),
    [basePath, auth, login, logout, reportError, collaboration]
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

/** The overview path (`/sites`), the create path, or one site's editor (`/sites/<handle>`). */
export function useSitesPaths() {
  const basePath = useSitesBasePath();
  return useMemo(
    () => ({
      overview: basePath,
      create: `${basePath}/neu`,
      site: (handle: string) => `${basePath}/${encodeURIComponent(handle)}`,
    }),
    [basePath]
  );
}

/** Router state the overview sets, so the way back is a step back instead of a new entry. */
export const FROM_OVERVIEW_STATE = { fromOverview: true } as const;

export function useSitesCollaboration(): CollaborationConfig {
  return useSitesContext().collaboration;
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
