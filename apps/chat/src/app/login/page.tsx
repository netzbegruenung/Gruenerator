'use client';

import { LoginProviders } from '@gruenerator/shared/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const redirectTo = searchParams.get('redirectTo') || '/';

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, redirectTo, router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--card, #ffffff)',
          padding: '3rem',
          borderRadius: '12px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            marginBottom: '1rem',
          }}
        >
          Grünerator Chat
        </h1>

        <p
          style={{
            color: 'var(--muted-foreground, #6b7280)',
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
          <p style={{ color: 'var(--muted-foreground, #6b7280)', marginTop: '1rem' }}>
            Weiterleitung zum Login...
          </p>
        )}
      </div>
    </div>
  );
}
