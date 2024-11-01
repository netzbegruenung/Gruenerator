import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import Header from '../../layout/Header/Header';
import Footer from '../../layout/Footer/Footer';
import { preloadAllGrueneratoren } from '../../pages/Grüneratoren';

const PageLayout = ({ children, darkMode, toggleDarkMode, showHeaderFooter = true }) => {
  useEffect(() => {
    // Lade alle Grüneratoren im Hintergrund
    const timeoutId = setTimeout(() => {
      preloadAllGrueneratoren();
    }, 1000); // Warte 1 Sekunde nach dem initialen Render

    return () => clearTimeout(timeoutId);
  }, []);

  if (!showHeaderFooter) {
    return <main className="content-wrapper">{children}</main>;
  }

  return (
    <>
      <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      <main className="content-wrapper">{children}</main>
      <Footer />
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