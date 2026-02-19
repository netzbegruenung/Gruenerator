import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';

import { LoginOverlay } from './LoginOverlay';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

type PublicCheckState = 'idle' | 'checking' | 'public' | 'private' | 'requires_auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const [publicCheckState, setPublicCheckState] = useState<PublicCheckState>('idle');
  const [documentTitle, setDocumentTitle] = useState<string | undefined>();

  const documentMatch = location.pathname.match(/^\/document\/([^/]+)/);
  const documentId = documentMatch?.[1];

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) return;
    if (!documentId) return;

    setPublicCheckState('checking');

    fetch(`${API_BASE}/docs/public/${documentId}`)
      .then(async (res) => {
        if (!res.ok) {
          setPublicCheckState('private');
          return;
        }

        const data = await res.json();

        if (data.share_mode === 'authenticated') {
          setDocumentTitle(data.title);
          setPublicCheckState('requires_auth');
        } else {
          setPublicCheckState('public');
        }
      })
      .catch(() => {
        setPublicCheckState('private');
      });
  }, [isLoading, isAuthenticated, documentId]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: '1.2rem',
          color: 'var(--font-color)',
        }}
      >
        Lädt...
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (documentId) {
    if (publicCheckState === 'idle' || publicCheckState === 'checking') {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontSize: '1.2rem',
            color: 'var(--font-color)',
          }}
        >
          Lädt...
        </div>
      );
    }

    if (publicCheckState === 'public') {
      return <>{children}</>;
    }

    if (publicCheckState === 'requires_auth') {
      return (
        <LoginOverlay
          documentTitle={documentTitle}
          redirectTo={location.pathname + location.search}
        />
      );
    }
  }

  const currentPath = location.pathname + location.search;
  return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
};
