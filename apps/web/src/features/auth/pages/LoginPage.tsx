import { LoginProviders, type LoginProvider } from '@gruenerator/shared/auth';
import { type JSX, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useInstantAuth } from '../../../hooks/useAuth';
import { getIntendedRedirect, isMobileAppContext } from '../../../utils/authRedirect';

// Login Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/auth/login-page.css';

// Auth Backend URL from environment variable or fallback to relative path
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Page name mapping for context display
const PAGE_NAMES: Record<string, string> = {
  sharepic: 'Sharepic Grünerator',
  universal: 'Universal Generator',
  presse: 'Presse Generator',
  'gruene-jugend': 'Grüne Jugend Generator',
  subtitler: 'Untertitel Generator',
  voice: 'Sprach-zu-Text',
  chat: 'KI-Chat',
  profile: 'Profil',
  groups: 'Gruppen',
  campaigns: 'Kampagnen',
  search: 'Suche',
  documents: 'Dokumente',
  notebook: 'Fragen & Antworten',
  generators: 'Generatoren',
  you: 'Grüne Ideen für dich',
  imagine: 'Grünerator Imagine',
};

const getPageName = (pathname: string): string => {
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) return 'Diese Seite';

  const mainPath = pathSegments[0];
  return PAGE_NAMES[mainPath] || 'Diese Seite';
};

interface LoginPageProps {
  mode?: 'standalone' | 'required';
  pageName?: string;
  customMessage?: string;
  onClose?: () => void;
}

const LoginPage = ({
  mode = 'standalone',
  pageName,
  customMessage,
  onClose,
}: LoginPageProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { loading, isAuthenticated, setLoginIntent } = useInstantAuth();

  const intendedRedirect =
    mode === 'required' ? location.pathname : getIntendedRedirect(location, '/profile');

  const isMobileApp = isMobileAppContext(location);

  const successMessage = location.state?.message;

  const displayPageName =
    pageName || (mode === 'required' ? getPageName(location.pathname) : undefined);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    }
  }, [onClose, navigate]);

  useEffect(() => {
    if (mode === 'required') {
      const handleEsc = (event: KeyboardEvent) => {
        if (event.keyCode === 27) {
          handleClose();
        }
      };
      document.addEventListener('keydown', handleEsc);
      return () => {
        document.removeEventListener('keydown', handleEsc);
      };
    }
  }, [mode, handleClose]);

  const handleBeforeLogin = (_provider: LoginProvider) => {
    setIsAuthenticating(true);
    setLoginIntent();
  };

  const getHeaderContent = () => {
    if (mode === 'required') {
      return (
        <div className="auth-header auth-header--required">
          <h1 className="gradient-title">{displayPageName}</h1>
          <p className="auth-subtitle">
            {customMessage ||
              (isMobileApp
                ? `Melde dich an, um ${displayPageName || 'die App'} zu nutzen`
                : displayPageName === 'Diese Seite'
                  ? 'Melde dich an, um fortzufahren'
                  : `Melde dich an, um ${displayPageName} zu nutzen`)}
          </p>
        </div>
      );
    }

    return (
      <div className="auth-header">
        <h1 className="gradient-title">{isMobileApp ? 'Willkommen!' : 'Willkommen zurück!'}</h1>
      </div>
    );
  };

  const loginProviders = (
    <>
      <LoginProviders
        redirectTo={intendedRedirect}
        apiBaseUrl={AUTH_BASE_URL}
        disabled={isAuthenticating}
        onBeforeLogin={handleBeforeLogin}
      />

      {isAuthenticating && (
        <div className="auth-status-message">
          <p>{isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}</p>
        </div>
      )}
    </>
  );

  if (mode === 'required') {
    return (
      <div className="auth-modal-overlay">
        <div className="auth-modal-backdrop" onClick={handleClose} />
        <div className="auth-container auth-container--modal">
          <button className="auth-modal-close" onClick={handleClose} aria-label="Login schließen">
            ×
          </button>
          <div className="auth-content-wrapper">
            <div className="auth-content-left">
              {getHeaderContent()}

              {successMessage && <div className="auth-success-message">{successMessage}</div>}

              <div className="auth-legal auth-legal--desktop">
                <p>
                  Mit der Anmeldung stimmst du unseren{' '}
                  <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link>{' '}
                  zu.
                </p>
              </div>
            </div>

            <div className="auth-content-right">{loginProviders}</div>
          </div>

          <div className="auth-legal auth-legal--mobile">
            <p>
              Mit der Anmeldung stimmst du unseren{' '}
              <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link> zu.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-content-wrapper">
        <div className="auth-content-left">
          {getHeaderContent()}

          {successMessage && <div className="auth-success-message">{successMessage}</div>}

          <div className="auth-legal auth-legal--desktop">
            <p>
              Mit der Anmeldung stimmst du unseren{' '}
              <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link> zu.
            </p>
          </div>
        </div>

        <div className="auth-content-right">{loginProviders}</div>
      </div>

      <div className="auth-legal auth-legal--mobile">
        <p>
          Mit der Anmeldung stimmst du unseren{' '}
          <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link> zu.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
