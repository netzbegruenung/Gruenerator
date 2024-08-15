import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/pages/Home';
import Antragsgenerator from './components/pages/Grüneratoren/Antragsgenerator';
import Pressemitteilung from './components/pages/Grüneratoren/Pressemitteilung';
import SocialMediaGenerator from './components/pages/Grüneratoren/SocialMediaGenerator';
import Sharepicgenerator from './components/pages/Grüneratoren/Sharepicgenerator'; // Neue Komponente hinzugefügt
import Webbaukasten from './components/pages/Webbaukasten';
import Antragsversteher from './components/pages/Grüneratoren/Antragsversteher';
import WahlpruefsteinThueringen from './components/pages/Grüneratoren/WahlpruefsteinThueringen';
import Redengenerator from './components/pages/Grüneratoren/Redengenerator';
import Datenschutz from './components/pages/Impressum_Datenschutz_Terms/Datenschutz';
import Impressum from './components/pages/Impressum_Datenschutz_Terms/Impressum';
import Header from './components/layout/Header/Header';
import Footer from './components/layout/Footer/Footer';
import ScrollToTop from './components/utils/ScrollToTop';
import { useScrollRestoration } from './components/utils/commonFunctions';
import PopupNutzungsbedingungen from './components/Popups/popup_nutzungsbedingungen';
import useAccessibility from './components/hooks/useAccessibility';
import useDarkMode from './components/hooks/useDarkMode';
import { SharepicGeneratorProvider } from './components/utils/Sharepic/SharepicGeneratorContext'; // SharepicGeneratorProvider importiert

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
    '/antragsgenerator',
    '/pressemitteilung',
    '/socialmedia',
    '/webbaukasten',
    '/antragsversteher',
    '/wahlpruefsteinthueringen',
    '/rede',
    '/datenschutz',
    '/impressum',
    '/nutzungsbedingungen'
  ];

  return (
    <Router>
      <ScrollToTop />
      <PopupNutzungsbedingungen />
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

        <Route path="/antragsgenerator-no-header-footer" element={<Antragsgenerator showHeaderFooter={false} darkMode={darkMode} />} />
        <Route path="/pressemitteilung-no-header-footer" element={<Pressemitteilung showHeaderFooter={false} darkMode={darkMode} />} />
        <Route path="/socialmedia-no-header-footer" element={<SocialMediaGenerator showHeaderFooter={false} darkMode={darkMode} />} />
        <Route path="/rede-no-header-footer" element={<Redengenerator ShowHeaderFooter={false} darkMode={darkMode} />} />
        <Route path="/antragsversteher-no-header-footer" element={<Antragsversteher showHeaderFooter={false} darkMode={darkMode} />} />
        <Route path="/sharepicgenerator-no-header-footer" element={
          <SharepicGeneratorProvider>
            <Sharepicgenerator showHeaderFooter={false} darkMode={darkMode} />
          </SharepicGeneratorProvider>
        } />
      </Routes>
    </Router>
  );
}

const RouteComponent = ({ path, darkMode }) => {
  switch (path) {
    case '/':
      return <Home darkMode={darkMode} />;
    case '/antragsgenerator':
      return <Antragsgenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/pressemitteilung':
      return <Pressemitteilung showHeaderFooter={true} darkMode={darkMode} />;
    case '/socialmedia':
      return <SocialMediaGenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/sharepicgenerator': // Neue Route hinzugefügt
      return <Sharepicgenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/webbaukasten':
      return <Webbaukasten darkMode={darkMode} />;
    case '/antragsversteher':
      return <Antragsversteher darkMode={darkMode} />;
    case '/wahlpruefsteinthueringen':
      return <WahlpruefsteinThueringen darkMode={darkMode} />;
    case '/rede':
      return <Redengenerator showHeaderFooter={true} darkMode={darkMode} />;
    case '/datenschutz':
      return <Datenschutz darkMode={darkMode} />;
    case '/impressum':
      return <Impressum darkMode={darkMode} />;
    default:
      return null;
  }
};

RouteComponent.propTypes = {
  path: PropTypes.string.isRequired,
  darkMode: PropTypes.bool.isRequired
};

export default App;
