import { LoginProviders, type LoginProvider } from '@gruenerator/shared/auth';
import { type JSX, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useInstantAuth } from '../../../hooks/useAuth';
import { getIntendedRedirect, isMobileAppContext } from '../../../utils/authRedirect';
import { cn } from '../../../utils/cn';

// Auth Backend URL from environment variable or fallback to relative path
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
        <div className="text-center mb-lg lg:text-left lg:mb-xl">
          <h1 className="gradient-title text-center text-[1.75rem] font-bold mb-sm lg:text-left lg:text-[2.2rem] lg:mb-md">
            {displayPageName}
          </h1>
          <p className="text-foreground text-base leading-normal mb-sm opacity-90 lg:text-[1.1rem] lg:leading-relaxed">
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
      <div className="text-center mb-lg lg:text-left lg:mb-xl">
        <h1 className="gradient-title text-center text-[2rem] font-bold mb-sm md:text-[2.2rem] lg:text-left lg:text-[2.5rem] lg:mb-md">
          {isMobileApp ? 'Willkommen!' : 'Willkommen zurück!'}
        </h1>
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
        <div className="bg-background-alt border border-grey-200 dark:border-grey-700 rounded-sm p-md mb-md text-center">
          <p className="m-0 text-foreground font-medium">
            {isMobileApp ? 'Zurück zur App...' : 'Weiterleitung zum Login...'}
          </p>
        </div>
      )}
    </>
  );

  if (mode === 'required') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-lg animate-in fade-in duration-200 max-[480px]:p-md">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div
          className={cn(
            'relative z-[1] w-full max-w-[450px] max-h-[90vh] overflow-y-auto',
            'bg-background border border-grey-200 dark:border-grey-700 rounded-sm',
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
                'w-full p-0 border-none bg-transparent',
                'lg:flex-[0_0_40%] lg:border-r lg:border-grey-200 lg:dark:border-grey-700',
                'lg:bg-background lg:rounded-sm lg:p-xl lg:relative'
              )}
            >
              {getHeaderContent()}

              {successMessage && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 p-md mb-md rounded-sm">
                  {successMessage}
                </div>
              )}

              <div className="hidden lg:block mt-lg text-center lg:text-left border-t border-grey-200 dark:border-grey-700 pt-md">
                <p className="m-0 text-foreground opacity-80 text-[0.85rem] leading-normal lg:text-[0.9rem]">
                  Mit der Anmeldung stimmst du unseren{' '}
                  <Link
                    to="/datenschutz"
                    className="text-primary-500 no-underline font-medium transition-colors duration-200 hover:text-primary-600 hover:underline"
                  >
                    Nutzungsbedingungen und der Datenschutzerklärung
                  </Link>{' '}
                  zu.
                </p>
              </div>
            </div>

            <div className="w-full p-0 bg-transparent lg:flex-1 lg:pl-md lg:bg-background lg:rounded-sm lg:p-xl">
              {loginProviders}
            </div>
          </div>

          <div className="block lg:hidden mt-lg text-center border-t border-grey-200 dark:border-grey-700 pt-md">
            <p className="m-0 text-foreground opacity-80 text-[0.85rem] leading-normal">
              Mit der Anmeldung stimmst du unseren{' '}
              <Link
                to="/datenschutz"
                className="text-primary-500 no-underline font-medium transition-colors duration-200 hover:text-primary-600 hover:underline"
              >
                Nutzungsbedingungen und der Datenschutzerklärung
              </Link>{' '}
              zu.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'max-w-[450px] mx-auto p-lg px-md mt-[50px] mb-[50px]',
        'bg-background rounded-md shadow-lg',
        'max-[480px]:p-md max-[480px]:px-sm max-[480px]:max-w-full max-[480px]:shadow-none max-[480px]:rounded-none max-[480px]:mt-0',
        'md:max-w-[600px] md:p-lg',
        'lg:max-w-[900px] lg:p-xl'
      )}
    >
      <div className="block lg:flex lg:gap-xl lg:items-start">
        <div
          className={cn(
            'w-full p-0 border-none bg-transparent',
            'lg:flex-[0_0_40%] lg:pr-xl lg:border-r lg:border-grey-200 lg:dark:border-grey-700',
            'lg:bg-background lg:rounded-sm lg:p-xl lg:relative'
          )}
        >
          {getHeaderContent()}

          {successMessage && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 p-md mb-md rounded-sm">
              {successMessage}
            </div>
          )}

          <div className="hidden lg:block mt-lg text-center lg:text-left border-t border-grey-200 dark:border-grey-700 pt-md">
            <p className="m-0 text-foreground opacity-80 text-[0.85rem] leading-normal lg:text-[0.9rem]">
              Mit der Anmeldung stimmst du unseren{' '}
              <Link
                to="/datenschutz"
                className="text-primary-500 no-underline font-medium transition-colors duration-200 hover:text-primary-600 hover:underline"
              >
                Nutzungsbedingungen und der Datenschutzerklärung
              </Link>{' '}
              zu.
            </p>
          </div>
        </div>

        <div className="w-full p-0 bg-transparent lg:flex-1 lg:pl-md lg:bg-background lg:rounded-sm lg:p-xl">
          {loginProviders}
        </div>
      </div>

      <div className="block lg:hidden mt-lg text-center border-t border-grey-200 dark:border-grey-700 pt-md">
        <p className="m-0 text-foreground opacity-80 text-[0.85rem] leading-normal">
          Mit der Anmeldung stimmst du unseren{' '}
          <Link
            to="/datenschutz"
            className="text-primary-500 no-underline font-medium transition-colors duration-200 hover:text-primary-600 hover:underline"
          >
            Nutzungsbedingungen und der Datenschutzerklärung
          </Link>{' '}
          zu.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
