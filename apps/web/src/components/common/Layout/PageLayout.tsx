import { type JSX, useEffect, Suspense, lazy, useState, type ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { GlobalChatProvider } from '../../../providers/GlobalChatProvider';
import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { isDesktopApp } from '../../../utils/platform';
import ProfileButton from '../../layout/Header/ProfileButton';
import { Sidebar } from '../../layout/Sidebar';
import SidebarToggle from '../../layout/SidebarToggle';
import '../../../assets/styles/components/layout/header.css';

const Footer = lazy(() => import('../../layout/Footer/Footer'));

const DesktopTitlebar = lazy(() => import('../../layout/DesktopTitlebar/DesktopTitlebar'));
const UpdateNotification = lazy(
  () => import('../../desktop/UpdateNotification/UpdateNotification')
);

interface PageLayoutProps {
  children: ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
  showHeaderFooter?: boolean;
}

const PageLayout = ({
  children,
  darkMode,
  toggleDarkMode,
  showHeaderFooter = true,
}: PageLayoutProps): JSX.Element => {
  const [showFooter, setShowFooter] = useState(false);
  const sidebarOpen = useSidebarStore((state) => state.isOpen);
  const hideAppSidebar = useSidebarStore((state) => state.hideAppSidebar);
  const navigate = useNavigate();
  const { createTab, tabs, activeTabId } = useDesktopTabsStore();

  useEffect(() => {}, [showHeaderFooter, darkMode, children]);

  useEffect(() => {
    const footerTimeout = setTimeout(() => {
      setShowFooter(true);
    }, 1000);

    return () => clearTimeout(footerTimeout);
  }, []);

  const handleDesktopNavigation = useCallback(
    (path: string, title: string) => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.route !== path) {
        createTab(path, title);
        void navigate(path);
      }
    },
    [tabs, activeTabId, createTab, navigate]
  );

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
          <Sidebar isDesktop={true} onNavigate={handleDesktopNavigation} />
          <main className="content-wrapper desktop-main">{children}</main>
        </div>
      </div>
    );
  }

  const layoutClasses = [
    'app-layout',
    sidebarOpen ? 'sidebar-open' : '',
    hideAppSidebar ? 'sidebar-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <GlobalChatProvider>
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
    </GlobalChatProvider>
  );
};

export default PageLayout;
