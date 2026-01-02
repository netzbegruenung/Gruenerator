import { JSX, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstantAuth } from '../../../hooks/useAuth';
import { getIntendedRedirect, getCurrentPath, isMobileAppContext, clearRedirectState } from '../../../utils/authRedirect';

// Login Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/auth/login-page.css';

// Auth Backend URL aus Environment Variable oder Fallback zu relativem Pfad
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Login Provider Configuration - Set enabled: false to hide a provider
const LOGIN_PROVIDERS = {
  gruenesNetz: { enabled: true },
  grueneOesterreich: { enabled: true },
  netzbegruenung: { enabled: true },
  gruenerator: { enabled: false }
};

// Helper function to extract page name from pathname for context
const getPageName = (pathname, t) => {
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) return t('pages.this_page');

  const mainPath = pathSegments[0];
  const pageKey = `pages.${mainPath.replace('-', '_')}`;

  // Try to get translation, fallback to this_page if not found
  const translatedName = t(pageKey);
  return translatedName !== pageKey ? translatedName : t('pages.this_page');
};

interface LoginPageProps {
  mode?: 'standalone' | 'required';
  pageName?: string;
  customMessage?: string;
  onClose?: () => void;
}

const LoginPage = ({ mode = 'standalone',
  pageName = null,
  customMessage = null,
  onClose = null }: LoginPageProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { loading, isAuthenticated, setLoginIntent } = useInstantAuth();

  // Get the intended redirect URL using the unified helper
  // When mode is 'required', use current pathname since we're blocking access to this page
  const intendedRedirect = mode === 'required'
    ? location.pathname
    : getIntendedRedirect(location, '/profile');

  // Check if this is a mobile app context
  const isMobileApp = isMobileAppContext(location);

  // Get success message from navigation state (e.g., from registration)
  const successMessage = location.state?.message;

  // Auto-detect page name if not provided and in required mode
  const displayPageName = pageName || (mode === 'required' ? getPageName(location.pathname, t) : null);

  // Handle modal close
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      // Default behavior: navigate back or to home
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    }
  }, [onClose, navigate]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (mode === 'required') {
      const handleEsc = (event) => {
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

  const handleGruenesNetzLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();

      const authUrl = `${AUTH_BASE_URL}/auth/login?source=gruenes-netz-login${intendedRedirect ? `&redirectTo=${encodeURIComponent(intendedRedirect)}` : ''}`;
      console.log(`[LoginPage] Grünes Netz Login - Redirecting to: ${authUrl}`);
      console.log(`[LoginPage] Intended redirect: ${intendedRedirect}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Grünes Netz Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const handleNetzbegrueungLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();

      const authUrl = `${AUTH_BASE_URL}/auth/login?source=netzbegruenung-login${intendedRedirect ? `&redirectTo=${encodeURIComponent(intendedRedirect)}` : ''}`;
      console.log(`[LoginPage] Netzbegrünung Login - Redirecting to: ${authUrl}`);
      console.log(`[LoginPage] Intended redirect: ${intendedRedirect}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Netzbegrünung Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const handleGrueneratorLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();

      const authUrl = `${AUTH_BASE_URL}/auth/login?source=gruenerator-login${intendedRedirect ? `&redirectTo=${encodeURIComponent(intendedRedirect)}` : ''}`;
      console.log(`[LoginPage] Grünerator Login - Redirecting to: ${authUrl}`);
      console.log(`[LoginPage] Intended redirect: ${intendedRedirect}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Grünerator Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const handleGrueneOesterreichLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();

      const authUrl = `${AUTH_BASE_URL}/auth/login?source=gruene-oesterreich-login${intendedRedirect ? `&redirectTo=${encodeURIComponent(intendedRedirect)}` : ''}`;
      console.log(`[LoginPage] Grüne Österreich Login - Redirecting to: ${authUrl}`);
      console.log(`[LoginPage] Intended redirect: ${intendedRedirect}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Grüne Österreich Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const getHeaderContent = () => {
    if (mode === 'required') {
      return (
        <div className="auth-header auth-header--required">
          <h1 className="gradient-title">{displayPageName}</h1>
          <p className="auth-subtitle">
            {customMessage || (isMobileApp
              ? t('login.mobile_app_subtitle', { pageName: displayPageName || 'App' })
              : displayPageName === t('pages.this_page')
                ? t('login.subtitle')
                : t('login.subtitle_with_page', { pageName: displayPageName })
            )}
          </p>
        </div>
      );
    }

    return (
      <div className="auth-header">
        <h1 className="gradient-title">{isMobileApp ? t('login.mobile_welcome') : t('welcome_back')}</h1>
      </div>
    );
  };

  // Helper function to render login buttons
  const getLoginButtons = () => (
    <div className="login-options">
      {LOGIN_PROVIDERS.gruenesNetz.enabled && (
        <button
          className="login-option gruenes-netz"
          onClick={handleGruenesNetzLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <img
              src="/images/Sonnenblume_RGB_gelb.png"
              alt="Grünes Netz"
              className="login-logo"
              width="50"
              height="50"
              loading="eager"
            />
            <div className="login-text-content">
              <h3 className="login-title">{t('login.sources.gruenes_netz.title')}</h3>
              <p className="login-description">
                {t('login.sources.gruenes_netz.description')}
              </p>
            </div>
          </div>
        </button>
      )}

      {LOGIN_PROVIDERS.grueneOesterreich.enabled && (
        <button
          className="login-option gruene-oesterreich"
          onClick={handleGrueneOesterreichLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <img
              src="/images/Grüne_at_Logo.svg.png"
              alt="Die Grünen – Die Grüne Alternative"
              className="login-logo"
              width="50"
              height="50"
              loading="eager"
            />
            <div className="login-text-content">
              <h3 className="login-title">{t('login.sources.gruene_oesterreich.title')}</h3>
              <p className="login-description">
                {t('login.sources.gruene_oesterreich.description')}
              </p>
            </div>
          </div>
        </button>
      )}

      {LOGIN_PROVIDERS.netzbegruenung.enabled && (
        <button
          className="login-option netzbegruenung"
          onClick={handleNetzbegrueungLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <img
              src="/images/nb_icon.png"
              alt="Netzbegrünung"
              className="login-logo"
              width="50"
              height="50"
              loading="eager"
            />
            <div className="login-text-content">
              <h3 className="login-title">{t('login.sources.netzbegruenung.title')}</h3>
              <p className="login-description">
                {t('login.sources.netzbegruenung.description')}
              </p>
            </div>
          </div>
        </button>
      )}

      {LOGIN_PROVIDERS.gruenerator.enabled && (
        <button
          className="login-option gruenerator"
          onClick={handleGrueneratorLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <span className="login-icon">🌱</span>
            <div className="login-text-content">
              <h3 className="login-title">Grünerator Login</h3>
              <p className="login-description">
                Für Mitarbeitende von Abgeordneten und Geschäftsstellen
              </p>
            </div>
          </div>
        </button>
      )}
    </div>
  );

  // Render modal for required mode
  if (mode === 'required') {
    return (
      <div className="auth-modal-overlay">
        <div className="auth-modal-backdrop" onClick={handleClose} />
        <div className="auth-container auth-container--modal">
          <button
            className="auth-modal-close"
            onClick={handleClose}
            aria-label="Login schließen"
          >
            ×
          </button>
          <div className="auth-content-wrapper">
            <div className="auth-content-left">
              {getHeaderContent()}

              {/* Success Message */}
              {successMessage && (
                <div className="auth-success-message">
                  {successMessage}
                </div>
              )}

              {/* Legal Notice for Desktop */}
              <div className="auth-legal auth-legal--desktop">
                <p>
                  Mit der Anmeldung stimmst du unseren{' '}
                  <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link> zu.
                </p>
              </div>
            </div>

            <div className="auth-content-right">
              {getLoginButtons()}

              {isAuthenticating && (
                <div className="auth-status-message">
                  <p>{isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Legal Notice for Mobile */}
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

  // Standalone mode - normal page layout
  return (
    <div className="auth-container">
      <div className="auth-content-wrapper">
        <div className="auth-content-left">
          {getHeaderContent()}

          {/* Success Message */}
          {successMessage && (
            <div className="auth-success-message">
              {successMessage}
            </div>
          )}

          {/* Legal Notice for Desktop */}
          <div className="auth-legal auth-legal--desktop">
            <p>
              Mit der Anmeldung stimmst du unseren{' '}
              <Link to="/datenschutz">Nutzungsbedingungen und der Datenschutzerklärung</Link> zu.
            </p>
          </div>
        </div>

        <div className="auth-content-right">
          {getLoginButtons()}

          {isAuthenticating && (
            <div className="auth-status-message">
              <p>{isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Legal Notice for Mobile */}
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
