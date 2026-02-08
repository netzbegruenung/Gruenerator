import { useState, useEffect } from 'react';
import { LoginProviders, type LoginProvider } from '@gruenerator/shared/auth';
import { type DocsCapacitorUser } from '../auth/capacitorAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gruenerator.eu/api';
const REDIRECT_URI = 'gruenerator-docs://auth/callback';

interface LoginPageProps {
  onAuthSuccess: (user: DocsCapacitorUser) => void;
  authError?: string | null;
}

export const LoginPage = ({ onAuthSuccess: _onAuthSuccess, authError }: LoginPageProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the parent surfaces an auth error (e.g. token exchange failed),
  // reset loading so the user can retry.
  useEffect(() => {
    if (authError) {
      setError(authError);
      setIsLoading(false);
    }
  }, [authError]);

  // Listen for app resume (user returns from in-app browser).
  // If the deep-link didn't fire, the user is stuck — reset loading to let them retry.
  useEffect(() => {
    if (!isLoading) return;

    let listener: { remove: () => Promise<void> } | null = null;

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // Give the deep-link handler a brief moment to fire first
          setTimeout(() => setIsLoading(false), 800);
        }
      }).then((l) => {
        listener = l;
      });
    });

    return () => {
      listener?.remove();
    };
  }, [isLoading]);

  const handleBeforeLogin = (_provider: LoginProvider) => {
    setIsLoading(true);
    setError(null);
  };

  const handleLogin = async (_provider: LoginProvider, authUrl: string) => {
    try {
      const { Browser } = await import('@capacitor/browser');
      const url = new URL(authUrl, window.location.origin);
      url.searchParams.set('redirectTo', REDIRECT_URI);
      // Rewrite base to the real API host (authUrl is relative like /api/auth/login?...)
      const finalUrl = `${API_BASE_URL}/auth/login?${url.searchParams.toString()}`;
      await Browser.open({
        url: finalUrl,
        presentationStyle: 'popover',
        toolbarColor: '#008939',
      });
    } catch {
      setError('Login konnte nicht gestartet werden.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-app-title">Grünerator Docs</h1>
          <p className="login-subtitle">Melde dich an, um deine Dokumente zu bearbeiten.</p>
        </div>

        {error && <p className="login-error">{error}</p>}

        <LoginProviders
          apiBaseUrl={API_BASE_URL}
          disabled={isLoading}
          onBeforeLogin={handleBeforeLogin}
          onLogin={handleLogin}
        />

        {isLoading && <p className="login-status">Weiterleitung zum Login...</p>}
      </div>
    </div>
  );
};
