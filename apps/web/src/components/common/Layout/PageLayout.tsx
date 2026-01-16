import { JSX, useEffect, Suspense, lazy, useState, ReactNode } from 'react';
import { Sidebar } from '../../layout/Sidebar';
import SidebarToggle from '../../layout/SidebarToggle';
import ProfileButton from '../../layout/Header/ProfileButton';
import { isDesktopApp } from '../../../utils/platform';
import useSidebarStore from '../../../stores/sidebarStore';
import '../../../assets/styles/components/layout/header.css';

const Footer = lazy(() => import('../../layout/Footer/Footer'));

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
  const sidebarOpen = useSidebarStore((state) => state.isOpen);
  const hideAppSidebar = useSidebarStore((state) => state.hideAppSidebar);

  useEffect(() => {
  }, [showHeaderFooter, darkMode, children]);

  useEffect(() => {
    const footerTimeout = setTimeout(() => {
      setShowFooter(true);
    }, 1000);

    return () => clearTimeout(footerTimeout);
  }, []);

  if (!showHeaderFooter) {
    return <main className="content-wrapper no-header-footer">{children}</main>;
  }

  const isDesktop = isDesktopApp();

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

  const layoutClasses = [
    'app-layout',
    sidebarOpen ? 'sidebar-open' : '',
    hideAppSidebar ? 'sidebar-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={layoutClasses}>
      <SidebarToggle />
      <div className="header-actions">
        <ProfileButton />
      </div>
      <Sidebar />
      <div className="app-content">
        <main className="content-wrapper">{children}</main>
        {showFooter && (
          <Suspense fallback={<div style={{ height: '80px' }} />}>
            <Footer />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default PageLayout;
