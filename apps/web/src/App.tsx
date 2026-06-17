import React, { lazy, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

import { GlobalBridges } from './components/common/Layout/GlobalBridges';
import SuspenseWrapper from './components/common/SuspenseWrapper';
import ErrorBoundary from './components/ErrorBoundary';
import useAccessibility from './components/hooks/useAccessibility';
import useDarkMode from './components/hooks/useDarkMode';
import AuthBootstrap from './components/routing/AuthBootstrap';
import AuthSplash from './components/routing/AuthSplash';
import HomeRedirect from './components/routing/HomeRedirect';
import LegacyGeneratorRedirect from './components/routing/LegacyGeneratorRedirect';
import RequireAuth from './components/routing/RequireAuth';
import RouteComponent from './components/routing/RouteComponent';
import { useScrollRestoration } from './components/utils/commonFunctions';
import ScrollToTop from './components/utils/ScrollToTop';
import { routes } from './config/routes';
import { useFirstRun } from './features/desktop/hooks/useFirstRun';
import { useHydrateUserProfile } from './hooks/useHydrateUserProfile';
import { GlobalChatProvider } from './providers/GlobalChatProvider';
import { type User, useAuthStore } from './stores/authStore';
import { cleanupDesktopAuth, type DesktopUser, initDesktopAuth } from './utils/desktopAuth';
import { isDesktopApp } from './utils/platform';
import './App.css';

function UserProfileHydrationBridge() {
  useHydrateUserProfile();
  return null;
}

// Lazy-load FirstRunWizard (desktop-only component)
const FirstRunWizard = lazy(() =>
  import('./features/desktop/components/FirstRunWizard').then((m) => ({
    default: m.FirstRunWizard,
  }))
);

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster, toast, TooltipProvider } from '@gruenerator/ui';

import { toastApiError } from './components/utils/toastError';
// PopupNutzungsbedingungen moved to inline HTML in index.html — see the
// `terms-banner` block there. It was the LCP element on / for fresh
// visitors and waited for the React boot to paint; inline removes that
// dependency entirely. The same `termsAccepted` localStorage key gates both.
const PopupWartung = lazy(() => import('./components/Popups/popup_wartung'));
// const CustomGrueneratorenPopup = lazy(() => import('./components/Popups/popup_custom_grueneratoren'));
// const PopupAustriaLaunch = lazy(() => import('./components/Popups/popup_austria_launch'));

// QueryClient Instanz erstellen
const queryClient = new QueryClient({
  // Global error surfacing: every failed query/mutation toasts via the shared
  // German error-message dictionary, unless the caller sets `meta: { silent: true }`.
  // Background prefetches with working fallbacks should opt out; user-initiated
  // queries and all mutations should let the toast fire.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent === true) return;
      toastApiError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent === true) return;
      toastApiError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 Minuten Cache
      gcTime: 15 * 60 * 1000, // Keep data in cache for 15 minutes (was cacheTime)
      refetchOnWindowFocus: false, // Verhindert unnötige Neuladungen
      refetchOnReconnect: 'always', // Nur bei Reconnect neu laden
      retry: (failureCount, error: unknown) => {
        // Smart retry logic. Status lives at `.status` on AxiosErrors and
        // ApiErrors, but at `.response.status` on older transformed shapes —
        // read both so 401/403/404 are reliably excluded from retries.
        const err = error as { status?: number; response?: { status?: number } } | undefined;
        const status = err?.status ?? err?.response?.status;
        if (status === 404 || status === 401 || status === 403) return false;
        return failureCount < 2; // Max 2 retries
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
  },
});

// Make queryClient globally available for cache invalidation
if (typeof window !== 'undefined') {
  window.queryClient = queryClient;
}

// Umami SPA Page View Tracking
const RouteLogger = () => {
  const location = useLocation();
  useEffect(() => {
    if (window.umami) {
      window.umami.track((props) => ({
        ...props,
        url: window.location.href,
        title: document.title,
      }));
    }
  }, [location]);
  return null;
};

function App() {
  useScrollRestoration();
  useAccessibility();
  const [darkMode, toggleDarkMode] = useDarkMode();
  const { isFirstRun, requireLogin, completeFirstRun } = useFirstRun();
  const { login, setAuthState } = useAuthStore();

  // Desktop (Tauri) OAuth callback: register the deep-link listener once on
  // startup so the gruenerator://auth/callback round-trip actually completes.
  // Must run above the isFirstRun early-return below — the wizard renders
  // before <AuthBootstrap />, so this is the only place that covers both.
  useEffect(() => {
    if (!isDesktopApp()) return;
    void initDesktopAuth(
      (user: DesktopUser) => {
        setAuthState({ user: user as unknown as User, isAuthenticated: true });
        completeFirstRun();
      },
      (error: string) => {
        toast.error(`Anmeldung fehlgeschlagen: ${error}`);
      }
    );
    return () => cleanupDesktopAuth();
  }, [setAuthState, completeFirstRun]);

  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  }, []);

  // Maintenance mode blocks entire app (off by default, set VITE_MAINTENANCE_MODE=true to enable)
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  if (isMaintenanceMode) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AuthSplash />}>
          <PopupWartung />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (isFirstRun) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AuthSplash />}>
          <FirstRunWizard
            requireLogin={requireLogin}
            onComplete={completeFirstRun}
            onLogin={login}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UserProfileHydrationBridge />
        <Toaster richColors position="top-right" />
        <TooltipProvider>
          <Router>
            <AuthBootstrap />
            <ScrollToTop />
            <RouteLogger />
            {/* Chat runtime mounts ONCE here (inside Router so useNavigate/
                useLocation work), wrapping all routes — not per-page in
                PageLayout, which re-mounted the runtime on every navigation
                (flickered the sidebar thread list and reset chat state). The
                ~200KB runtime chunk stays lazy: GrueneratorChatProvider only
                imports it when authenticated, so login/public pages are
                unaffected. */}
            <GlobalChatProvider>
              <GlobalBridges />
              <SuspenseWrapper>
                {/* <PopupAustriaLaunch /> */}
                <div id="aria-live-region" aria-live="polite" className="sr-only" />

                <Routes>
                  {/* Legacy redirect: /generator/:slug -> /gruenerator/:slug */}
                  <Route path="/generator/:slug" element={<LegacyGeneratorRedirect />} />

                  {/*
                Single auth model: auth-required is the default. A route opts
                out by setting `public: true` in routes.ts. The marketing
                startpage at `/` additionally redirects authenticated users
                to `/workplace` via <HomeRedirect>.
              */}
                  {routes.map(({ path, layoutMode, public: isPublic }) => {
                    const routeElement = (
                      <RouteComponent
                        path={path}
                        darkMode={darkMode}
                        toggleDarkMode={toggleDarkMode}
                        layoutMode={layoutMode}
                      />
                    );

                    let element: React.ReactNode;
                    if (path === '/' || path === '/startseite') {
                      // Public but with a logged-in-redirect to /workplace.
                      element = <HomeRedirect>{routeElement}</HomeRedirect>;
                    } else if (isPublic) {
                      element = routeElement;
                    } else {
                      // Wrap with RequireAuth via an index-route pattern so the
                      // guard renders <Outlet /> on success.
                      element = null;
                    }

                    if (element === null) {
                      return (
                        <Route key={path} element={<RequireAuth />}>
                          <Route path={path} element={routeElement} />
                        </Route>
                      );
                    }

                    return <Route key={path} path={path} element={element} />;
                  })}
                </Routes>
              </SuspenseWrapper>
            </GlobalChatProvider>
          </Router>
        </TooltipProvider>
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
