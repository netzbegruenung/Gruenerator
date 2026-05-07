import { type ReactNode, useEffect, useRef } from 'react';

import { useAuth, useSitesBasePath } from '../../SitesContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const basePath = useSitesBasePath();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      login(`${basePath}/edit`);
    }
  }, [isLoading, isAuthenticated, login, basePath]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Authentifizierung wird geprüft...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="loading-container">
        <p>Weiterleitung zum Login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
