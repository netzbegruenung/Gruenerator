import { useEffect, Suspense, lazy, useState, ReactNode } from 'react';
import Header from '../../layout/Header/Header';
import { isDesktopApp } from '../../../utils/platform';

// Lazy load Footer
const Footer = lazy(() => import('../../layout/Footer/Footer'));

// Lazy load desktop-specific components
const DesktopTitlebar = lazy(() => import('../../layout/DesktopTitlebar/DesktopTitlebar'));
const DesktopSidebar = lazy(() => import('../../layout/DesktopSidebar/DesktopSidebar'));
const UpdateNotification = lazy(() => import('../../desktop/UpdateNotification/UpdateNotification'));

interface PageLayoutProps {
  children: ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
  showHeaderFooter?: boolean;
}

const PageLayout = ({ children, darkMode, toggleDarkMode, showHeaderFooter = true }: PageLayoutProps): JSX.Element => {
  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
  }, [showHeaderFooter, darkMode, children]);

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

  const isDesktop = isDesktopApp();

  // Desktop layout with titlebar and sidebar
  if (isDesktop) {
    return (
      <div className="desktop-layout">
        <Suspense fallback={null}>
          <DesktopTitlebar />
        </Suspense>
        <Suspense fallback={null}>
          <UpdateNotification />
        </Suspense>
        <div className="desktop-content-area">
          <Suspense fallback={null}>
            <DesktopSidebar />
          </Suspense>
          <main className="content-wrapper desktop-main">{children}</main>
        </div>
      </div>
    );
  }

  // Web layout with header and footer
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

export default PageLayout;
