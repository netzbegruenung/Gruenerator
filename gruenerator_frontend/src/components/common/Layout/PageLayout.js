import React, { useEffect, Suspense, lazy, useState } from 'react';
import PropTypes from 'prop-types';
import Header from '../../layout/Header/Header';
import { preloadAllGrueneratoren } from '../../pages/Grüneratoren';

// Lazy load Footer
const Footer = lazy(() => import('../../layout/Footer/Footer'));

const PageLayout = ({ children, darkMode, toggleDarkMode, showHeaderFooter = true }) => {
  const [showFooter, setShowFooter] = useState(false);

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
    }, 100);

    return () => clearTimeout(footerTimeout);
  }, []);

  if (!showHeaderFooter) {
    return <main className="content-wrapper">{children}</main>;
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