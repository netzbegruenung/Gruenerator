import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const [publicCheckState, setPublicCheckState] = useState<'idle' | 'checking' | 'public' | 'private'>('idle');

  const documentMatch = location.pathname.match(/^\/document\/([^/]+)/);
  const documentId = documentMatch?.[1];

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) return;
    if (!documentId) return;

    setPublicCheckState('checking');

    fetch(`${API_BASE}/docs/public/${documentId}`)
      .then((res) => {
        setPublicCheckState(res.ok ? 'public' : 'private');
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
  }

  const currentPath = location.pathname + location.search;
  return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
};
