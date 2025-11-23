import React, { lazy, useEffect } from 'react';
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
const PopupNutzungsbedingungen = lazy(() => import('./components/Popups/popup_nutzungsbedingungen'));
const CustomGrueneratorenPopup = lazy(() => import('./components/Popups/popup_custom_grueneratoren'));

// QueryClient Instanz erstellen
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 Minuten Cache
      gcTime: 15 * 60 * 1000, // Keep data in cache for 15 minutes (was cacheTime)
      refetchOnWindowFocus: false, // Verhindert unnötige Neuladungen
      refetchOnReconnect: 'always', // Nur bei Reconnect neu laden
      retry: (failureCount, error) => {
        // Smart retry logic
        if (error?.status === 404 || error?.status === 401) return false;
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

// Debug-Komponente für Route-Logging
const RouteLogger = () => {
  const location = useLocation();
  useEffect(() => {
    // Keine Logger-Aufrufe
  }, [location]);
  return null;
};

function App() {
  useScrollRestoration();
  const { setupKeyboardNav } = useAccessibility();
  const [darkMode, toggleDarkMode] = useDarkMode();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Tab') {
        const focusableElements = document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        setupKeyboardNav(Array.from(focusableElements));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setupKeyboardNav]);

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

  return (
    <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
              <Router>
                <ScrollToTop />
                <RouteLogger />
                <SuspenseWrapper>
                  <PopupNutzungsbedingungen />
                  <CustomGrueneratorenPopup />
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
