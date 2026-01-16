import React, { lazy, useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ScrollToTop from './components/utils/ScrollToTop';
import { useScrollRestoration } from './components/utils/commonFunctions';
import useAccessibility from './components/hooks/useAccessibility';
import useDarkMode from './components/hooks/useDarkMode';
import ErrorBoundary from './components/ErrorBoundary';
import SuspenseWrapper from './components/common/SuspenseWrapper';
import RouteComponent from './components/routing/RouteComponent';
import LegacyGeneratorRedirect from './components/routing/LegacyGeneratorRedirect';
import { routes } from './config/routes';
import { useFirstRun } from './features/desktop/hooks/useFirstRun';
import { useAuthStore } from './stores/authStore';
import { initializeApiClient } from './api/lazyApiClient';
import { initializeI18n } from './i18n/lazyI18n';
import './App.css';

// Lazy-load FirstRunWizard (desktop-only component)
const FirstRunWizard = lazy(() =>
  import('./features/desktop/components/FirstRunWizard').then(m => ({
    default: m.FirstRunWizard
  }))
);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
const PopupNutzungsbedingungen = lazy(() => import('./components/Popups/popup_nutzungsbedingungen'));
// const CustomGrueneratorenPopup = lazy(() => import('./components/Popups/popup_custom_grueneratoren'));
const PopupAustriaLaunch = lazy(() => import('./components/Popups/popup_austria_launch'));

// QueryClient Instanz erstellen
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 Minuten Cache
      gcTime: 15 * 60 * 1000, // Keep data in cache for 15 minutes (was cacheTime)
      refetchOnWindowFocus: false, // Verhindert unnötige Neuladungen
      refetchOnReconnect: 'always', // Nur bei Reconnect neu laden
      retry: (failureCount, error: unknown) => {
        // Smart retry logic
        const status = (error as { status?: number })?.status;
        if (status === 404 || status === 401) return false;
        return failureCount < 2; // Max 2 retries
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
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
      window.umami.track(props => ({
        ...props,
        url: window.location.href,
        title: document.title
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
  const { login } = useAuthStore();
  const [appReady, setAppReady] = useState(false);

  // Initialize API client and i18n after React mounts (deferred from index.tsx)
  useEffect(() => {
    Promise.all([
      initializeApiClient(),
      initializeI18n()
    ])
      .then(() => {
        setAppReady(true);
      })
      .catch((error) => {
        console.error('[App] Initialization failed:', error);
        // Still mark as ready to allow app to render (some features may work)
        setAppReady(true);
      });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
  }, []);

  // Show minimal loading state while API and i18n initialize (typically <100ms)
  if (!appReady) {
    return (
      <div className="app-loading">
        <div className="app-loading-text">Lädt...</div>
      </div>
    );
  }

  if (isFirstRun) {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="app-loading">
            <div className="app-loading-text">Lädt...</div>
          </div>
        }>
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
              <Router>
                <ScrollToTop />
                <RouteLogger />
                <SuspenseWrapper>
                  <PopupNutzungsbedingungen />
                  <PopupAustriaLaunch />
                  <div id="aria-live-region" aria-live="polite" className="sr-only"></div>

                  <Routes>
                    {/* Legacy redirect: /generator/:slug -> /gruenerator/:slug */}
                    <Route path="/generator/:slug" element={<LegacyGeneratorRedirect />} />
                    {/* Standard-Routen */}
                    {routes.standard.map(({ path }) => (
                      <Route
                        key={path}
                        path={path}
                        element={
                          <RouteComponent
                            path={path}
                            darkMode={darkMode}
                            toggleDarkMode={toggleDarkMode}
                          />
                        }
                      />
                    ))}

                    {/* Spezielle Routen */}
                    {routes.special.map(({ path }) => (
                      <Route
                        key={path}
                        path={path}
                        element={
                          <RouteComponent
                            path={path}
                            darkMode={darkMode}
                            toggleDarkMode={toggleDarkMode}
                            isSpecial
                          />
                        }
                      />
                    ))}

                    {/* No-Header-Footer Routen */}
                    {routes.noHeaderFooter.map(({ path }) => {
                      return (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <RouteComponent
                              path={path}
                              darkMode={darkMode}
                              toggleDarkMode={toggleDarkMode}
                              showHeaderFooter={false}
                            />
                          }
                        />
                      );
                    })}

                  </Routes>
                </SuspenseWrapper>
              </Router>
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
