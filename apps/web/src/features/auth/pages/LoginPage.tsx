import {
  LoginProviders,
  LOGIN_PROVIDERS,
  detectCountryProviderId,
  getProviderById,
  getRememberedProvider,
  rememberProvider,
  signInWithProvider,
  type LoginProvider,
  type LoginProviderId,
} from '@gruenerator/shared/auth';
import { type JSX, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { TRANSPARENCY_NOTICE } from '../../../config/transparencyNotice';
import { useInstantAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import { getIntendedRedirect, isMobileAppContext } from '../../../utils/authRedirect';
import { cn } from '../../../utils/cn';
import { openDesktopLogin, type AuthSource } from '../../../utils/desktopAuth';
import { isDesktopApp } from '../../../utils/platform';
import { startPagePath } from '../../../utils/startpage';
import { SESSION_EXPIRED_FLAG } from '../storageKeys';

import './login-page-sunrise.css';

// Auth Backend URL from environment variable or fallback to relative path
const AUTH_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// Page name mapping for context display
const PAGE_NAMES: Record<string, string> = {
  sharepic: 'Sharepic Grünerator',
  universal: 'Universal Generator',
  presse: 'Presse Generator',
  subtitler: 'Untertitel Generator',
  voice: 'Sprach-zu-Text',
  chat: 'KI-Chat',
  profile: 'Profil',
  groups: 'Gruppen',
  campaigns: 'Kampagnen',
  search: 'Suche',
  documents: 'Dokumente',
  notebook: 'Fragen & Antworten',
  generators: 'Grüneratoren',
  you: 'Grüne Ideen für dich',
  imagine: 'Grünerator Imagine',
};

const getPageName = (pathname: string): string => {
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) return 'Diese Seite';

  const mainPath = pathSegments[0];
  return PAGE_NAMES[mainPath] || 'Diese Seite';
};

const LockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

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

  // Once the profile is loaded (e.g. an already-authenticated user hitting the
  // login page, or right after sign-in), fall back to their preferred start
  // page instead of the hardcoded Workplace Chat tab.
  const startPage = useAuthStore((s) => s.user?.default_startpage);
  // Memoized: getIntendedRedirect logs its decision, and running it on every
  // render prints "[AuthRedirect] …" once per re-render — which reads like
  // repeated redirects when debugging a logout.
  const intendedRedirect = useMemo(
    () =>
      mode === 'required'
        ? location.pathname
        : getIntendedRedirect(location, startPagePath(startPage)),
    [mode, location, startPage]
  );

  const isMobileApp = isMobileAppContext(location);

  const successMessage = (location.state as { message?: string } | null)?.message;

  // Read-and-remove: set by performLoginRedirect (apiClient) when a dead
  // session forced the user here. Lazy initializer so it survives re-renders
  // but is consumed exactly once per redirect.
  const [sessionExpired] = useState(() => {
    try {
      const flag = sessionStorage.getItem(SESSION_EXPIRED_FLAG);
      if (flag !== null) sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
      return flag !== null;
    } catch {
      return false;
    }
  });

  const displayPageName =
    pageName || (mode === 'required' ? getPageName(location.pathname) : undefined);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      if (window.history.length > 1) {
        void navigate(-1);
      } else {
        void navigate('/');
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

  const handleBeforeLogin = (provider: LoginProvider) => {
    rememberProvider(provider.id);
    setIsAuthenticating(true);
    setLoginIntent();
  };

  const desktopOnLogin = isDesktopApp()
    ? (provider: LoginProvider) => {
        // Desktop (Tauri): use the native source/deep-link flow, not the web
        // Better-Auth cookie flow (its session never reaches the app).
        void openDesktopLogin(provider.source as AuthSource).catch(() => {
          setIsAuthenticating(false);
        });
      }
    : undefined;

  // Netzbegrünung is no longer part of the default provider set; it stays
  // reachable only via the special link /login?provider=netzbegruenung, which
  // re-adds it alongside the defaults. (The standalone screen below uses its
  // own, newer provider-detection mechanism — see primaryProviderId.)
  const requiredEnabledProviders: LoginProviderId[] | undefined =
    new URLSearchParams(location.search).get('provider') === 'netzbegruenung'
      ? ['gruenes-netz', 'gruene-oesterreich', 'netzbegruenung']
      : undefined;

  // Same mechanism as the public start page (StartpageHero): a remembered or
  // deep-linked provider wins, else the timezone decides the country. Only one
  // provider card is shown up front; "Anderer Anbieter" reveals the rest.
  // Resolved once on mount — everything needed is available synchronously
  // (CSR SPA).
  //
  // `primaryProviderId` darf null sein, und das ist der Kern der Sache: ist das
  // Land unklar, wird nicht geraten, sondern gefragt (siehe countryChoiceCta).
  const [{ primaryProviderId, providersInitiallyOpen }] = useState(() => {
    const params = new URLSearchParams(location.search);
    const loginParam = params.get('login');
    const deepLinked = LOGIN_PROVIDERS.some((p) => p.id === loginParam)
      ? (loginParam as LoginProviderId)
      : params.get('provider') === 'netzbegruenung'
        ? ('netzbegruenung' as LoginProviderId)
        : null;
    const primary = deepLinked ?? getRememberedProvider() ?? detectCountryProviderId();
    return { primaryProviderId: primary, providersInitiallyOpen: deepLinked !== null };
  });
  const [providersOpen, setProvidersOpen] = useState(providersInitiallyOpen);

  const getHeaderContent = () => {
    if (mode === 'required') {
      // The expiry notice renders independently of customMessage: LoginRequired
      // passes a customMessage in common flows, and the expired-session hint
      // must not be silently swallowed by it.
      const showExpiredNotice = sessionExpired && !successMessage;
      return (
        <div className="text-center mb-lg lg:text-left lg:mb-xl">
          <h1 className="gradient-title text-center text-[1.75rem] font-bold mb-sm lg:text-left lg:text-[2.2rem] lg:mb-md">
            {displayPageName}
          </h1>
          {showExpiredNotice && (
            <p className="text-foreground text-base leading-normal mb-sm opacity-90 lg:text-[1.1rem] lg:leading-relaxed">
              {`Deine Sitzung ist abgelaufen — melde dich erneut an, um ${displayPageName === 'Diese Seite' ? 'fortzufahren' : `${displayPageName} zu nutzen`}`}
            </p>
          )}
          {(customMessage || !showExpiredNotice) && (
            <p className="text-foreground text-base leading-normal mb-sm opacity-90 lg:text-[1.1rem] lg:leading-relaxed">
              {customMessage ||
                (isMobileApp
                  ? `Melde dich an, um ${displayPageName || 'die App'} zu nutzen`
                  : displayPageName === 'Diese Seite'
                    ? 'Melde dich an, um fortzufahren'
                    : `Melde dich an, um ${displayPageName} zu nutzen`)}
            </p>
          )}
        </div>
      );
    }

    return (
      <h1 className="lp-headline">
        {sessionExpired && !successMessage
          ? isMobileApp
            ? 'Willkommen! Deine Sitzung ist abgelaufen'
            : 'Willkommen zurück — deine Sitzung ist abgelaufen'
          : isMobileApp
            ? 'Willkommen!'
            : 'Willkommen zurück!'}
      </h1>
    );
  };

  const authenticatingNotice = isAuthenticating && (
    <div className="bg-background-alt border border-grey-200 dark:border-grey-700 rounded-sm p-md mb-md text-center">
      <p className="m-0 text-foreground font-medium">
        {isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}
      </p>
    </div>
  );

  const requiredLoginProviders = (
    <>
      <LoginProviders
        enabledProviders={requiredEnabledProviders}
        redirectTo={intendedRedirect}
        apiBaseUrl={AUTH_BASE_URL}
        disabled={isAuthenticating}
        onBeforeLogin={handleBeforeLogin}
        onLogin={desktopOnLogin}
      />
      {authenticatingNotice}
    </>
  );

  // Standalone screen goes straight to the primary provider on one tap — same
  // mechanism as StartpageHero's startLogin, not routed through <LoginProviders>
  // (whose branded description cards are the required-mode / first-run-wizard
  // look, not the minimal hero pill this screen now matches).
  const startLogin = (id: LoginProviderId) => {
    const provider = getProviderById(id);
    if (!provider) return;
    handleBeforeLogin(provider);
    if (desktopOnLogin) {
      desktopOnLogin(provider);
    } else {
      void signInWithProvider(provider, intendedRedirect, AUTH_BASE_URL).catch((err) => {
        console.error('[LoginPage] Sign-in failed:', err);
        setIsAuthenticating(false);
      });
    }
  };

  const primaryProvider = primaryProviderId ? getProviderById(primaryProviderId) : undefined;

  const standaloneLoginCta = (
    <div className="lp-cta">
      {/* Ohne erkanntes Land keine Vorauswahl: beide Länder stehen gleichrangig
          nebeneinander. Ein einzelner „Anmelden"-Knopf müsste sich für eines
          entscheiden, und diese stille Entscheidung fiel bisher immer auf
          Deutschland — auch für österreichische Mitglieder, deren Browser
          erwartungsgemäß Deutsch meldet. */}
      {primaryProviderId === null ? (
        <>
          <p className="lp-hint" id="lp-country-question">
            In welchem Land bist du grün aktiv?
          </p>
          <div className="lp-cta-row" role="group" aria-labelledby="lp-country-question">
            <button
              type="button"
              className="lp-login"
              onClick={() => startLogin('gruenes-netz')}
              disabled={isAuthenticating}
            >
              <LockIcon /> Deutschland
            </button>
            <button
              type="button"
              className="lp-login"
              onClick={() => startLogin('gruene-oesterreich')}
              disabled={isAuthenticating}
            >
              <LockIcon /> Österreich
            </button>
          </div>
        </>
      ) : (
        <div className="lp-cta-row">
          <button
            type="button"
            className="lp-login"
            onClick={() => startLogin(primaryProviderId)}
            disabled={isAuthenticating}
            aria-label={primaryProvider ? `Anmelden mit ${primaryProvider.title}` : 'Anmelden'}
          >
            <LockIcon /> Anmelden
          </button>
        </div>
      )}

      {isAuthenticating && (
        <p className="lp-hint">
          {isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}
        </p>
      )}

      <p className="lp-hint">
        Mit der Anmeldung stimmst du unseren{' '}
        <Link to="/datenschutz" className="lp-hint-link">
          Nutzungsbedingungen und der Datenschutzerklärung
        </Link>{' '}
        zu.
      </p>

      <p className="lp-hint">{TRANSPARENCY_NOTICE}</p>

      <button
        type="button"
        className="lp-provider-toggle"
        onClick={() => setProvidersOpen((open) => !open)}
        aria-expanded={providersOpen}
      >
        {providersOpen ? 'Anbieter ausblenden' : 'Anderer Anbieter'}
      </button>

      {providersOpen && (
        <ul className="lp-provider-list">
          {LOGIN_PROVIDERS.map((provider) => (
            <li key={provider.id}>
              <button
                type="button"
                className="lp-provider"
                aria-current={provider.id === primaryProviderId ? 'true' : undefined}
                onClick={() => startLogin(provider.id)}
                disabled={isAuthenticating}
              >
                {provider.logoPath ? (
                  <img src={provider.logoPath} alt="" className="lp-provider-logo" />
                ) : (
                  <span className="lp-provider-logo" aria-hidden="true">
                    🌱
                  </span>
                )}
                {provider.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (mode === 'required') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-lg animate-in fade-in duration-200 max-[480px]:p-md">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Overlay schließt per Klick; Tastatur nutzt Escape (siehe useEffect oben) */}
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div
          className={cn(
            'lp-sunrise-card relative z-[1] w-full max-w-[450px] max-h-[90vh] overflow-y-auto',
            'border border-grey-200 dark:border-grey-700 rounded-sm',
            'shadow-xl animate-in slide-in-from-bottom-5 fade-in duration-300',
            'lg:w-auto lg:min-w-[700px] lg:max-w-[95vw]',
            'max-[480px]:max-h-[95vh] max-[480px]:p-md'
          )}
        >
          <button
            className={cn(
              'absolute top-md right-md z-10 w-9 h-9',
              'bg-background-alt border border-grey-200 dark:border-grey-700 rounded-full',
              'cursor-pointer flex items-center justify-center',
              'text-2xl leading-none text-foreground',
              'transition-all duration-200 ease-out',
              'hover:bg-grey-100 dark:hover:bg-grey-800 hover:scale-105',
              'focus:outline-2 focus:outline-primary-500 focus:outline-offset-2',
              'active:scale-95'
            )}
            onClick={handleClose}
            aria-label="Login schließen"
          >
            ×
          </button>
          <div className="block lg:flex lg:gap-xl lg:items-start">
            <div
              className={cn(
                'lp-col w-full p-0 border-none bg-transparent',
                'lg:flex-[0_0_40%] lg:border-r lg:border-grey-200 lg:dark:border-grey-700',
                'lg:rounded-sm lg:p-xl lg:relative'
              )}
            >
              {getHeaderContent()}

              {successMessage && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 p-md mb-md rounded-sm">
                  {successMessage}
                </div>
              )}

              <div className="hidden lg:block mt-lg text-center lg:text-left border-t border-grey-200 dark:border-grey-700 pt-md">
                <p className="m-0 text-muted-foreground text-[0.85rem] leading-normal lg:text-[0.9rem]">
                  Mit der Anmeldung stimmst du unseren{' '}
                  <Link
                    to="/datenschutz"
                    className="text-primary-600 dark:text-primary-400 no-underline font-medium transition-colors duration-200 hover:text-primary-700 dark:hover:text-primary-300 hover:underline"
                  >
                    Nutzungsbedingungen und der Datenschutzerklärung
                  </Link>{' '}
                  zu.
                </p>
                <p className="m-0 mt-sm text-muted-foreground text-[0.8rem] leading-normal">
                  {TRANSPARENCY_NOTICE}
                </p>
              </div>
            </div>

            <div className="lp-col w-full p-0 bg-transparent lg:flex-1 lg:pl-md lg:rounded-sm lg:p-xl">
              {requiredLoginProviders}
            </div>
          </div>

          <div className="block lg:hidden mt-lg text-center border-t border-grey-200 dark:border-grey-700 pt-md">
            <p className="m-0 text-muted-foreground text-[0.85rem] leading-normal">
              Mit der Anmeldung stimmst du unseren{' '}
              <Link
                to="/datenschutz"
                className="text-primary-600 dark:text-primary-400 no-underline font-medium transition-colors duration-200 hover:text-primary-700 dark:hover:text-primary-300 hover:underline"
              >
                Nutzungsbedingungen und der Datenschutzerklärung
              </Link>{' '}
              zu.
            </p>
            <p className="m-0 mt-sm text-muted-foreground text-[0.8rem] leading-normal">
              {TRANSPARENCY_NOTICE}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Same structure as the public start page's hero (StartpageHero): full-bleed
  // backdrop, single centered column, logo top bar, one-tap primary CTA. This
  // is what auto-logout / a dead session bounces users back to, so it should
  // read as literally the same screen, not a card version of it.
  return (
    <>
      <div className="lp-page-sunrise" aria-hidden="true" />

      <section className="lp-hero">
        <div className="lp-topbar">
          <img
            src="/images/gruenerator_logo_gruen.svg"
            alt="Grünerator"
            className="lp-logo lp-logo-light"
          />
          <img
            src="/images/gruenerator_logo_weiss.svg"
            alt="Grünerator"
            aria-hidden="true"
            className="lp-logo lp-logo-dark"
          />
        </div>

        {getHeaderContent()}

        {successMessage && (
          <div className="bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 p-md mb-md rounded-sm max-w-[380px]">
            {successMessage}
          </div>
        )}

        {standaloneLoginCta}
      </section>
    </>
  );
};

export default LoginPage;
