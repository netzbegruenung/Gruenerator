import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/pages/Home';
import Antrag from './components/pages/Grüneratoren/Antragsgenerator';
import Pressemitteilung from './components/pages/Grüneratoren/Pressemitteilung';
import SocialMediaGenerator from './components/pages/Grüneratoren/SocialMediaGenerator';
import Sharepicgenerator from './components/pages/Grüneratoren/Sharepicgenerator'; // Neue Komponente hinzugefügt
import Webbaukasten from './components/pages/Webbaukasten';
import Antragscheck from './components/pages/Grüneratoren/Antragsversteher';
import WahlpruefsteinThueringen from './components/pages/Grüneratoren/WahlpruefsteinThueringen';
import Redengenerator from './components/pages/Grüneratoren/Redengenerator';
import Datenschutz from './components/pages/Impressum_Datenschutz_Terms/Datenschutz';
import Impressum from './components/pages/Impressum_Datenschutz_Terms/Impressum';
import Header from './components/layout/Header/Header';
import Footer from './components/layout/Footer/Footer';
import ScrollToTop from './components/utils/ScrollToTop';
import { useScrollRestoration } from './components/utils/commonFunctions';
import PopupNutzungsbedingungen from './components/Popups/popup_nutzungsbedingungen';
import WelcomePopup from './components/Popups/popup_welcome';
import useAccessibility from './components/hooks/useAccessibility';
import useDarkMode from './components/hooks/useDarkMode';
import Wahlprogramm from './components/pages/Grüneratoren/Wahlprogramm';
import { SharepicGeneratorProvider } from './components/utils/Sharepic/SharepicGeneratorContext'; // SharepicGeneratorProvider importiert
import { FormProvider } from './components/utils/FormContext';
import Gruenerator_Editor from './components/pages/Gruenerator_Editor';
import SupabaseTest from './components/utils/SupabaseTest'; // Neue Komponente importiert
import ErrorBoundary from './components/ErrorBoundary';

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

  const routesWithHeaderFooter = [
    '/',
    '/antrag',
    '/pressemitteilung',
    '/socialmedia',
    '/webbaukasten',
    '/antragscheck',
    '/wahlpruefsteinthueringen',
    '/rede',
    '/wahlprogramm',
    '/datenschutz',
    '/impressum',
    '/nutzungsbedingungen',
    '/supabase-test' // Neue Route für den Supabase-Test
  ];

  return (
    <ErrorBoundary>
      <Router>
        <ScrollToTop />
        <PopupNutzungsbedingungen />
        <WelcomePopup />
        <div id="aria-live-region" aria-live="polite" style={{ position: 'absolute', left: '-9999px' }}></div>
        <Routes>
          {routesWithHeaderFooter.map(path => (
            <Route key={path} path={path} element={
              <>
                <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
                <RouteComponent path={path} darkMode={darkMode} />
                <Footer />
              </>
            } />
          ))}

          <Route path="/sharepicgenerator" element={
            <SharepicGeneratorProvider>
              <>
                <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
                <Sharepicgenerator showHeaderFooter={true} darkMode={darkMode} />
                <Footer />
              </>
            </SharepicGeneratorProvider>
          } />

          <Route path="/antrag-no-header-footer" element={<Antrag showHeaderFooter={false} darkMode={darkMode} />} />
          <Route path="/pressemitteilung-no-header-footer" element={<Pressemitteilung showHeaderFooter={false} darkMode={darkMode} />} />
          <Route path="/socialmedia-no-header-footer" element={<SocialMediaGenerator showHeaderFooter={false} darkMode={darkMode} />} />
          <Route path="/rede-no-header-footer" element={<Redengenerator ShowHeaderFooter={false} darkMode={darkMode} />} />
          <Route path="/antragscheck-no-header-footer" element={<Antragscheck showHeaderFooter={false} darkMode={darkMode} />} />
          <Route path="/sharepicgenerator-no-header-footer" element={
            <SharepicGeneratorProvider>
              <Sharepicgenerator showHeaderFooter={false} darkMode={darkMode} />
            </SharepicGeneratorProvider>
          } />
          <Route path="/wahlprogramm-no-header-footer" element={<Wahlprogramm showHeaderFooter={false} darkMode={darkMode} />} />

          {/* Neue Route für SavedContentPage */}
          <Route path="/ae/:linkName" element={
            <ErrorBoundary>
              <FormProvider>
                <>
                  <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
                  <Gruenerator_Editor darkMode={darkMode} />
                  <Footer />
                </>
              </FormProvider>
            </ErrorBoundary>
          } />

          {/* Neue Route für SupabaseTest */}
          <Route path="/supabase-test" element={
            <>
              <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
              <SupabaseTest />
              <Footer />
            </>
          } />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

const RouteComponent = ({ path, darkMode }) => {
  switch (path) {
    case '/':
      return <Home darkMode={darkMode} />;
    case '/antrag':
      return (
        <FormProvider>
          <Antrag showHeaderFooter={true} darkMode={darkMode} />
        </FormProvider>
      );
    case '/pressemitteilung':
      return (
        <FormProvider>
          <Pressemitteilung showHeaderFooter={true} darkMode={darkMode} />
        </FormProvider>
      );
    case '/socialmedia':
      return (
        <FormProvider>
          <SocialMediaGenerator showHeaderFooter={true} darkMode={darkMode} />
        </FormProvider>
      );
    case '/sharepicgenerator': // Neue Route hinzugefügt
      return <Sharepicgenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/webbaukasten':
      return <Webbaukasten darkMode={darkMode} />;
    case '/antragscheck':
      return <Antragscheck darkMode={darkMode} />;
    case '/wahlpruefsteinthueringen':
      return <WahlpruefsteinThueringen darkMode={darkMode} />;
    case '/rede':
      return <Redengenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/datenschutz':
      return <Datenschutz darkMode={darkMode} />;
    case '/impressum':
      return <Impressum darkMode={darkMode} />;
    case '/wahlprogramm':
      return (
        <FormProvider>
          <Wahlprogramm showHeaderFooter={true} darkMode={darkMode} />
        </FormProvider>
      );
    case '/supabase-test':
      return <SupabaseTest />;
    default:
      return null;
  }
};

RouteComponent.propTypes = {
  path: PropTypes.string.isRequired,
  darkMode: PropTypes.bool.isRequired
};

export default App;
