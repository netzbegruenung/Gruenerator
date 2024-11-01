import React, { lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/utils/ScrollToTop';
import { useScrollRestoration } from './components/utils/commonFunctions';
import useAccessibility from './components/hooks/useAccessibility';
import useDarkMode from './components/hooks/useDarkMode';
import ErrorBoundary from './components/ErrorBoundary';
import SuspenseWrapper from './components/common/SuspenseWrapper';
import RouteComponent from './components/routing/RouteComponent';
import { routes } from './config/routes';

// Lazy loading für Popups
const PopupNutzungsbedingungen = lazy(() => import('./components/Popups/popup_nutzungsbedingungen'));
const WelcomePopup = lazy(() => import('./components/Popups/popup_welcome'));

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

  return (
    <ErrorBoundary>
      <Router>
        <ScrollToTop />
        <SuspenseWrapper>
          <PopupNutzungsbedingungen />
          <WelcomePopup />
          <div id="aria-live-region" aria-live="polite" className="sr-only"></div>
          
          <Routes>
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
            {routes.noHeaderFooter.map(({ path }) => (
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
            ))}
          </Routes>
        </SuspenseWrapper>
      </Router>
    </ErrorBoundary>
  );
}

export default App;