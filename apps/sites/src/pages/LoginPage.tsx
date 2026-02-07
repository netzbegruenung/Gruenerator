import { LoginProviders } from '@gruenerator/shared/auth';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const redirectTo = searchParams.get('redirectTo') || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, redirectTo, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--background-color)',
        padding: '2rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--card-background)',
          padding: '3rem',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            marginBottom: '1rem',
            color: 'var(--font-color)',
          }}
        >
          Grünerator Sites
        </h1>

        <p
          style={{
            color: 'var(--font-color-secondary)',
            marginBottom: '2rem',
          }}
        >
          Melde dich an, um fortzufahren
        </p>

        <LoginProviders
          redirectTo={redirectTo}
          disabled={isAuthenticating}
          onBeforeLogin={() => {
            setIsAuthenticating(true);
          }}
        />

        {isAuthenticating && (
          <p style={{ color: 'var(--font-color-secondary)', marginTop: '1rem' }}>
            Weiterleitung zum Login...
          </p>
        )}
      </div>
    </div>
  );
};
