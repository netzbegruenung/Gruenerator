/**
 * Protected Route Component
 * Ensures user is authenticated before rendering children
 */

'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

export function ProtectedRoute({ children, redirectTo = '/' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (!isLoading && !isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      login(redirectTo);
    }
  }, [isLoading, isAuthenticated, login, redirectTo]);

  if (AUTH_DISABLED) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-foreground-muted">Authentifizierung wird geprüft...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-foreground-muted">Weiterleitung zum Login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
