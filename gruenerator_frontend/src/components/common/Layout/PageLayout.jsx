import React, { useEffect, Suspense, lazy, useState } from 'react';
import PropTypes from 'prop-types';
import Header from '../../layout/Header/Header';
import { GrueneratorenBundle } from '../../../config/routes';

// Lazy load Footer
const Footer = lazy(() => import('../../layout/Footer/Footer'));

const preloadAllGrueneratoren = () => {
  Object.values(GrueneratorenBundle).forEach(component => {
    if (component && typeof component.preload === 'function') {
      component.preload().catch(console.error);
    }
  });
};

const PageLayout = ({ children, darkMode, toggleDarkMode, showHeaderFooter = true }) => {
  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
  }, [showHeaderFooter, darkMode, children]);

  useEffect(() => {
    // Lade alle Grüneratoren im Hintergrund
    const timeoutId = setTimeout(() => {
      preloadAllGrueneratoren();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // Verzögere das Anzeigen des Footers
    const footerTimeout = setTimeout(() => {
      setShowFooter(true);
    }, 1000);

    return () => clearTimeout(footerTimeout);
  }, []);

  if (!showHeaderFooter) {
    return <main className="content-wrapper no-header-footer">{children}</main>;
  }

  return (
    <>
      <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      <main className="content-wrapper">{children}</main>
      {showFooter && (
        <Suspense fallback={<div style={{ height: '80px' }} />}>
          <Footer />
        </Suspense>
      )}
    </>
  );
};

PageLayout.propTypes = {
  children: PropTypes.node.isRequired,
  darkMode: PropTypes.bool.isRequired,
  toggleDarkMode: PropTypes.func.isRequired,
  showHeaderFooter: PropTypes.bool
};

export default PageLayout;